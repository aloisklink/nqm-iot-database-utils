/**
 * Module to manage the sqlite database.
 *
 * ![nqminds-blue-logo.png][1] ![interlinq-logo-darker.png][2]
 *
 * [1]: ./img/nqminds-blue-logo.png
 * [2]: ./img/interlinq-logo-darker.png
 *
 * @module sqlite-manager
 * @author Alexandru Mereacre <mereacre@gmail.com>
 */
"use strict";

const _ = require("lodash");
const del = require("del");
const sqlite3 = require("sqlite3");
const Promise = require("bluebird");
const shortid = require("shortid");
const builder = require("mongo-sql");
// node.js built-in
const util = require("util");
const fs = require("fs");
const os = require("os");
const path = require("path");

const sqliteConstants = require("./sqlite-constants.js");
const sqliteInfoTable = require("./sqlite-info-table.js");
const sqliteConverter = require("./sqlite-schema-converter.js");
const sqliteHelper = require("./sqlite-helper.js");
const sqliteCreator = require("./sqlite-statement-creator.js");
const sqliteNdarray = require("./sqlite-ndarray.js");

const queryLimit = sqliteConstants.SQLITE_QUERY_LIMIT;

Promise.promisifyAll(sqlite3);

const checkNodeVersion = require("./check-node-version.js");
checkNodeVersion();

/**
 * @global
 * @typedef  {object} DatasetData
 * @property  {object} metaData - The dataset metadata (see `nqmMeta` option in `getDatasetData`).
 * @property  {string} metaDataUrl - The URL to the dataset metadata (see `nqmMeta` option in `getDatasetData`).
 * @property  {DataRow[]} data - The dataset documents.
 */

/**
 * @global
 * @typedef  {object} NdarrayData
 * @property  {Buffer|{object: any}} data - The ndarray data Buffer or Stream.
 * @property  {string} dtype - The ndarray data type is of type `NDARRAY_DTYPES`.
 * @property  {number[]} shape - The ndarray shape.
 * @property  {boolean} major - The ndarray major (`true` - row-major, `false` - column-major).
 * @property  {string} ftype - The ndarray file type is of type `NDARRAY_FTYPES`.
 */

/**
 * A row of data, with `{columnname: rowvalue}`.
 * @global
 * @typedef {{[columnName: string]: any}} DataRow
 */

/**
 * An object the shows the status of a command.
 * @global
 * @typedef  {object} CommandResult
 * @property  {string} commandId - The auto-generated unique id of the command.
 * @property  {object|string} response - The response of the command.
 *     If a command is sent asynchronously, this will
 *     simply be the string `"ack"`.
 *     In synchronous mode, this will usually be an object consisting of the
 *     primary key of the data that was affected by the command.
 * @property  {object} result - Contains detailed error information
 *     when available.
 * @property  {array} result.errors - Will contain error information
 *     when appropriate.
 * @property  {array} result.commit - Contains details of each
 *     committed document.
 */

/**
 * Picks specific columns from an object if they exist.
 * @param {Object<string, any>} obj
 * @param {Array<string>} columns A list of columns to pick if they exist.
 * @returns {Object<string, any>}
 *   The input object with only keys in `columns`.
 */
function pick(obj, columns) {
  return columns.reduce(
    (res, key) => {
      const value = obj[key];
      if (value !== undefined) {
        res[key] = obj[key];
      }
      return res;
    },
    {},
  );
}

const warnedAlready = new Set();
function warn(warning, name, code) {
  if (warnedAlready.has(code)) {
    return; // only warn once per process
  }
  warnedAlready.add(code);
  process.emitWarning(warning, name, code);
}

/**
 * Makes an empty {@link CommandResult}
 *
 * Async since shortid is probably really slow
 * @returns {Promise<CommandResult>} An empty commandResult.
 */
async function makeEmptyCommandResult() {
  return {
    // reduce change of commandId having multiple shortids appended together
    // [x^2/(2*64**7) = 0.5](https://www.wolframalpha.com/input/?i=x%5E2%2F(2*64**21)+%3D+0.5)
    // using just one shortid which might have only 4 characters where each
    // character has 64 possibilites means you only need 2 million commands
    // until you have a 50% change of a collision
    commandId: shortid.generate() + shortid.generate() + shortid.generate(),
    response: null,
    result: {
      commit: [],
      errors: [],
    },
  };
}

/**
 * Find all the keys in a collection that satisfy a given value
 * @param {object} collection - The input collection.
 * @param {string} searchValue - The search value.
 * @returns {string[]} The list of keys.
 */
function findCollectionKeys(collection, searchValue) {
  const keys = [];

  _.forEach(collection, (value, key) => {
    if (value === searchValue) {
      keys.push(key);
    }
  });

  return keys;
}
/**
 * An object that describes a Resource/Dataset
 * @global
 * @typedef {object} Resource
 * @property {string} description
 * @property {string} id - The unique ID of the resource
 * @property {string} name
 * @property {string[]} parents
 * @property {object} schemaDefinition
 * @property {string[]} tags
 * @property {object} meta
 */

const mkdir = util.promisify(fs.mkdir);

// path is a parameter in openDatabase() so define the function we need here
const dirname = path.dirname;
const basename = path.basename;
const join = path.join;

/**
 * Opens a sqlite database. Creates if none exists.
 * @function
 * @async
 * @alias module:sqlite-manager.openDatabase
 * @param {string} filepath - The path of the db
 * @param {string} type - The type of the db: "file" or "memory"
 * @param {string} mode - The open mode of the db: "w+" or "rw" or "r"
 * @returns {Promise<object>}
 *   Returns the sqlite3 db object from module node-sqlite3
 */
module.exports.openDatabase = async function(filepath, type, mode) {
  const databasePath = (type === sqliteConstants.DATABASE_FILE_TYPE) ? filepath : sqliteConstants.DATABASE_MEMORY_MODE;
  let databaseMode = sqlite3.OPEN_READONLY;

  if (mode === "w+") { // Create for read and write
    databaseMode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
  } else if (mode === "rw" || mode === "wr") { // Open for read and write
    databaseMode = sqlite3.OPEN_READWRITE;
  } else if (mode === "r") { // Open only for read
    databaseMode = sqlite3.OPEN_READONLY;
  }

  if (type === sqliteConstants.DATABASE_FILE_TYPE) {
    // makes sure the parent directory exists
    await mkdir(dirname(databasePath), {recursive: true});
  }

  // promisify the sqlite3.Database constructor
  async function connectToDB() {
    let db;
    await new Promise((resolve, reject) => {
      db = new sqlite3.Database(databasePath, databaseMode, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    return db;
  }

  const db = await connectToDB();

  // Make the data folder
  let dataFolderPath = "";
  if (type === sqliteConstants.DATABASE_FILE_TYPE) {
    const dataFolderName = basename(databasePath) + sqliteConstants.DATABASE_FOLDER_SUFFIX;
    dataFolderPath = join(dirname(databasePath), dataFolderName);
  } else if (type === sqliteConstants.DATABASE_MEMORY_TYPE) {
    const dataFolderName = sqliteConstants.DATABASE_DATA_TMP_NAME + sqliteConstants.DATABASE_FOLDER_SUFFIX;
    const tempDir = fs.realpathSync(os.tmpdir());
    dataFolderPath = join(tempDir, dataFolderName);
  }

  // Make the data folders
  await mkdir(dataFolderPath, {recursive: true});

  // Store the data folder path in the db object
  db.dataFolder = dataFolderPath;

  // Generate an id to store the general schema in the dictionary
  db.id = shortid.generate();

  return db;
};

/**
 * Closes a sqlite database.
 * @function
 * @alias module:sqlite-manager.closeDatabase
 * @param {object} db - The sqlite3 db object from module node-sqlite3
 * @returns {Promise<object>} - The empty promise or error
 */
module.exports.closeDatabase = function(db) {
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
};

/**
 * Creates a dataset in the sqlite database.
 * @function
 * @alias module:sqlite-manager.createDataset
 * @param {object} db - The sqlite3 db object from module node-sqlite3
 * @param  {object} options - details of the dataset to be added
 * @param  {string} [options.basedOnSchema="dataset"] - the id of the schema on which this resource will be based.
 * @param  {object} [options.derived] -
 *     definition of derived filter, implying this resource is a view on an existing dataset.
 * @param  {object} [options.derived.filter] - the (read) filter to apply, in mongodb query format,
 *     e.g. `{"temperature": {"$gt": 15}}` will mean that only data with a temperature value greater than 15 will be
 *     available in this view. The filter can be any arbitrarily complex mongodb query. Use the placeholder
 *     `"@@_identity_@@"` to indicate that the identity of the currently authenticated user should be substituted.
 *     For example, if the user `bob@acme.com/tdx.acme.com` is currently authenticated, a filter of `{"username":
 *     "@@_identity_@@"}` will resolve at runtime to `{"username": "bob@acme.com/tdx.acme.com"}`.
 * @param  {object} [options.derived.projection] - the (read) projection to apply, in mongodb projection format,
 *     e.g. `{"timestamp": 1, "temperature": 1}` implies only the 'timestamp' and 'temperature' properties will be
 *     returned.
 * @param  {string} [options.derived.source] - the id of the source dataset on which to apply the filters and
 *     projections.
 * @param  {object} [options.derived.writeFilter] - the write filter to apply, in mongodb query format. This
 *     controls what data can be written to the underlying source dataset. For example, a write filter of
 *     `{"temperature": {"$lt": 40}}` means that attempts to write a temperature value greater than or equal to `40`
 *     will fail. The filter can be any arbitrarily complex mongodb query.
 * @param  {object} [options.derived.writeProjection] - the write projection to apply, in mongodb projection format.
 *     This controls what properties can be written to the underlying dataset. For example, a write projection of
 *     `{"temperature": 1}` means that only the temperature field can be written, and attempts to write data to other
 *     properties will fail. To allow a view to create new data in the underlying dataset, the primary key fields
 *     must be included in the write projection.
 * @param  {string} [options.description] - a description for the resource.
 * @param  {string} [options.id] - the requested ID of the new resource. Must be unique.
 *     Will be auto-generated if omitted (recommended).
 * @param  {string} [options.name] - the name of the resource. Must be unique in the parent folder.
 * @param  {object} [options.meta] - a free-form object for storing metadata associated with this resource.
 * @param  {string} [options.parentId] - the id of the parent resource.
 *     If omitted, will default to the appropriate root folder based on the type of resource being created.
 * @param  {string} [options.provenance] - a description of the provenance of the resource.
 *     Markdown format is supported.
 * @param  {object} [options.schema] - optional schema definition.
 * @param  {object} [options.schema.dataSchema] - data schema definition object. Has TDX object structure.
 * @param  {object[]} [options.schema.uniqueIndex] - array of key value pairs denoting
 *     the ascending or descending order of the columns.
 * @param  {string} [options.shareMode] - the share mode assigned to the new resource.
 *     One of [`"pw"`, `"pr"`, `"tr"`], corresponding to:
 *     "public read/write", "public read/trusted write", "trusted only".
 * @param  {string[]} [options.tags] - a list of tags to associate with the resource.
 * @returns {Promise<string>} - The id of the dataset created
 * @example <caption>create a dataset with give id and schema</caption>
 *  manager.createDataset(db, {
 *    "id": "12345",
 *    "schema": {
 *      "dataSchema": {
 *        "prop1": {"__tdxType": ["number"]}
 *      },
 *      "uniqueIndex": [{"asc": "prop1"}]
 *    }
 *  });
 */
module.exports.createDataset = async function(db, options) {
  // Dataset id
  options.id = options.id || shortid.generate();

  // Initialise an empty schema
  options.schema = options.schema || {};

  // Dataset data schema
  options.schema.dataSchema = options.schema.dataSchema || {};

  // Dataset primary key definition
  options.schema.uniqueIndex = options.schema.uniqueIndex || [];

  if (
    _.isEmpty(options.schema.dataSchema) &&
    options.schema.uniqueIndex.length) {
    // throw early if there's a unique index but no schema
    throw Error("[sqlite-manager]: index doesn't match schema.");
  }

  const infoExists = await sqliteInfoTable.checkInfoTable(db);
  if (infoExists) {
    // Check if schema match
    const pair = await sqliteInfoTable.getInfoKeys(db, ["id", "schema"]);
    pair[0].id = pair[0].id || "";
    pair[1].schema = pair[1].schema || {};

    // Keep the original id
    // eslint-disable-next-line require-atomic-updates
    options.id = pair[0].id;

    // Check for schema equality
    if (!_.isEqual(pair[1].schema, options.schema)) {
      throw Error("[sqlite-manager]: schemas don't coincide" +
        `Original schema was: ${pair[1].schema}.\n` +
        `Current schema is ${options.schema}.\n`);
    }
  } else {
    // create a new info table
    await sqliteInfoTable.createInfoTable(db);
    await sqliteInfoTable.setInfoKeys(db, _.map(options, (value, key) => {
      const pair = {};
      pair[key] = value;
      return pair;
    }));

    // Map the converted schema to a valid sqlite schema and then
    // map it to a string
    const schema = await module.exports.getGeneralSchema(db);
    const sqliteSchemaKeys = _.map(
      sqliteConverter.mapSchema(schema),
      (value, key) => `${key} ${value}`,
    );
    // Create the sqlite "CREATE TABLE" query index definition
    const tableColumnStr = sqliteSchemaKeys.join(",");

    const sqlitePrimaryKeyStrArr = options.schema.uniqueIndex.map(
      (value) => {
        const entries = Object.entries(value);
        if (entries.length !== 1) {
          throw Error(
            "[sqlite-manager]: uniqueIndex Object should have one key. " +
            `Object: ${value} has ${entries.length} keys.`,
          );
        }
        const [sortOrder, sortKey] = entries[0];
        const sqliteSortTypes = {
          asc: sqliteConstants.SQLITE_SORT_TYPE_ASC,
          desc: sqliteConstants.SQLITE_SORT_TYPE_DESC,
        };
        const sortType = sqliteSortTypes[sortOrder];
        if (sortType === undefined) {
          throw Error(
            "[sqlite-manager]: uniqueIndex sortOrder should be in " +
            `${Object.keys(sqliteSortTypes)}. Instead got ${value}.`);
        }
        return `${sortKey} ${sortType}`;
      },
    );
    // Create the sqlite "CREATE TABLE" query primary key definition
    const sqlitePrimaryKeyStr = sqlitePrimaryKeyStrArr.join(",");

    if (tableColumnStr !== "") {
      // Create the table without the index
      const createTableQuery = `CREATE TABLE ${sqliteConstants.DATABASE_DATA_TABLE_NAME}(${tableColumnStr})`;
      await db.runAsync(createTableQuery, []);

      if (sqlitePrimaryKeyStr !== "") {
        // Create the index
        const createIndexQuery = (
          `CREATE UNIQUE INDEX ${sqliteConstants.DATABASE_TABLE_INDEX_NAME} ` +
          `ON ${sqliteConstants.DATABASE_DATA_TABLE_NAME}(${sqlitePrimaryKeyStr})`
        );
        await db.runAsync(createIndexQuery, []);
      }
    }
  }
  return options.id;
};

/**
 * Returns the general schema.
 * @function
 * @alias module:sqlite-manager.getGeneralSchema
 * @param {object} db - The sqlite3 db object from module node-sqlite3.
 * @returns {Promise<object>} - The general schema object
 */
module.exports.getGeneralSchema = async function(db) {
  const cachedGeneralSchema = db.generalSchema;
  if (cachedGeneralSchema) {
    return cachedGeneralSchema;
  }
  const tdxSchema = await sqliteInfoTable.getInfoKeys(db, ["schema"]);

  let thisGeneralSchema = {};

  if (tdxSchema.length) {
    // Dataset schema definition
    tdxSchema[0].schema = tdxSchema[0].schema || {};

    // Dataset data schema
    tdxSchema[0].schema.dataSchema = tdxSchema[0].schema.dataSchema || {};

    thisGeneralSchema = await sqliteConverter.convertSchema(
      tdxSchema[0].schema.dataSchema);

    // Assign the general schema if the info table exists and the dataset exists
    // eslint-disable-next-line require-atomic-updates
    db.generalSchema = thisGeneralSchema;
  }
  return thisGeneralSchema;
};

/**
 * Add data to a dataset resource.
 * @function
 * @async
 * @alias module:sqlite-manager.addData
 * @param {object} db - The sqlite3 db object from module node-sqlite3.
 * @param {DataRow|DataRow[]} data - The data to add.
 *     Must conform to the schema defined by the resource metadata.
 *     Supports creating an individual document or many documents.
 * @return  {Promise<object<string, int>>}
 *     - The promise with the total count of rows added.
 * @example <caption>create an individual document</caption>
 * // returns {"count": 1} if successful
 * manager.addData(db, {lsoa: "E0000001", count: 398});
 * @example <caption>create multiple documents</caption>
 * manager.addData(db, [
 *  {lsoa: "E0000001", count: 398},
 *  {lsoa: "E0000002", count: 1775},
 *  {lsoa: "E0000005", count: 4533},
 * ]);
 * @example <caption>add a 2D ndarray</caption>
 * buffer = Buffer.alloc(23*34);
 * manager.addData(db, {id: 1, array: manager.getNdarrayMeta(buffer, "float64", [23, 34])});
 */
module.exports.addData = async function(db, data) {
  const schema = await module.exports.getGeneralSchema(db);
  const dataToConvert = [].concat(data);

  // remove extra columns in data that aren't in the schema
  const onlySchemaColumns = dataToConvert.map((row) => {
    const onlySchemaColumnRow = pick(row, Object.keys(schema));
    if (Object.keys(row).length !== Object.keys(onlySchemaColumnRow).length) {
      warn(`${"Ignoring extra fields in row that were not in schema. " +
        `Row was: ${JSON.stringify(row)} and extra keys were: `}${
        Object.keys(row).filter((col) => schema[col] === undefined)}`,
      "ExtraFields", "AddDataExtraFields",
      );
    }
    return onlySchemaColumnRow;
  });

  // Get the ndarray keys
  const ndarrayKeys = findCollectionKeys(
    schema, sqliteConstants.SQLITE_GENERAL_TYPE_NDARRAY);

  // Save the ndarray data to file
  let arrayProcData = onlySchemaColumns;
  if (ndarrayKeys.length > 0) {
    arrayProcData = await sqliteNdarray.writeNdarrayMany(
      db, onlySchemaColumns, ndarrayKeys);
  }

  // convert all the data to SQLite types
  const sqlData = arrayProcData.map((row) => {
    return sqliteConverter.convertRowToSqlite(schema, row);
  });
  const infoTable = await sqliteInfoTable.getInfoKeys(db, ["schema"]);
  const uniqueIndex = infoTable[0].schema.uniqueIndex;

  // set function for creating SQLite String, INSERT
  const upsert = false;
  const makeSqlStatementStr = (dataRowKeys) => {
    return sqliteCreator.insertStatement(uniqueIndex, schema, dataRowKeys, upsert);
  };

  // throws an error if it fails
  await sqliteHelper.executeMany(db, makeSqlStatementStr, sqlData);
  return {"count": sqlData.length};
};

/**
 * @deprecated use {@link getData()}
 * Gets all data from the given dataset that matches the filter provided.
 * @function
 * @alias module:sqlite-manager.getDatasetData
 * @param  {object} db - The id of the dataset-based resource.
 * @param  {object} [filter] - A mongodb filter object. If omitted, all data will be retrieved.
 * @param  {object} [projection] - A mongodb projection object. Should be used to restrict the payload to the
 * minimum properties needed if a lot of data is being retrieved.
 * @param  {object} [options] - A mongodb options object. Can be used to limit, skip, sort etc. Note a default
 * `limit` of 1000 is applied if none is given here.
 * @param  {boolean} [options.nqmMeta] - If:
 *   - `true`, the resource metadata will be returned along with the dataset
 *     data. Can be used to avoid a second call to `getResource`.
 *   - `false`-y, a URL to the metadata is provided.
 * @return  {Promise<DatasetData>}
 */
module.exports.getDatasetData = function(db, filter, projection, options) {
  return getDataQuery(db, false, filter, projection, options);
};

/**
 * Gets all data from the given dataset that matches the filter provided.
 * @alias module:sqlite-manager.getData
 * @param {object} db - The sqlite3 db object from module node-sqlite3.
 * @param {object} [filter] - A mongodb filter object. If omitted, all data will be retrieved.
 * @param {object} [projection] - A mongodb projection object. Should be used to restrict the payload to the
 * minimum properties needed if a lot of data is being retrieved.
 * @param {object} [options] - A mongodb options object. Can be used to limit, skip, sort etc. Note a default
 * `limit` of 1000 is applied if none is given here.
 * @param {number} [options.skip] - Number of documents to skip.
 * @param {number} [options.limit] - Limit number of documents to output.
 * @param {{string: number}} [options.sort]
 *   Sorting object by schema keys:
 *    e.g. `{prop1: 1, prop2: -1}`, where `1` = ascending, `-1` = descending.
 * @param {boolean} [options.nqmMeta] - When set, the resource metadata will be returned along with the dataset
 * data. Can be used to avoid a second call to `getResource`. Otherwise a URL to the metadata is provided.
 * @return {Promise<DatasetData>}
 */
module.exports.getData = function(db, filter, projection, options) {
  return getDataQuery(db, false, filter, projection, options);
};

/**
 * Gets a list of distinct values for a given property in a dataset-based resource.
 * @alias module:sqlite-manager.getDistinct
 * @param {object} db - The sqlite3 db object from module node-sqlite3.
 * @param {string} key - The name of the property to use. Can be a property path, e.g. "address.postcode".
 * @param {object} [filter] - An optional mongodb filter to apply.
 * @return {Promise<object[]>}
 */
module.exports.getDistinct = function(db, key, filter) {
  const projection = {};

  if (key !== "") {
    projection[key] = 1;
  }

  return getDataQuery(db, true, filter, projection, {});
};

/**
 * Gets all data from the given dataset that matches the filter provided and the select provided.
 * @param {object} db - The sqlite3 db object from module node-sqlite3.
 * @param {boolean} [distinct] - Select type ("select" - 0, "select distinct" - 1).
 * @param {object} [filter] - A mongodb filter object. If omitted, all data will be retrieved.
 * @param {object} [projection] - A mongodb projection object. Should be used to restrict the payload to the
 * minimum properties needed if a lot of data is being retrieved.
 * @param {object} [options] - A mongodb options object.
 *   Can be used to limit, skip, sort etc.
 * @param {number} [options.skip] - Number of documents to skip.
 * @param {number} [options.limit=queryLimit]
 *   Limit number of documents to output. If `false`-y or above `queryLimit`,
 *   sets to `queryLimit`.
 * @param {{string: number}} [options.sort]
 *   Sorting object by schema keys:
 *    e.g. `{prop1: 1, prop2: -1}`, where `1` = ascending, `-1` = descending.
 * @param {boolean} [options.nqmMeta] - When set, the resource metadata will be returned along with the dataset
 * data. Can be used to avoid a second call to `getResource`. Otherwise a URL to the metadata is provided.
 * @return {Promise<DatasetData | any[]>}
 */
async function getDataQuery(db, distinct, filter, projection, options) {
  // Set the default values
  filter = filter || {};
  projection = projection || {};
  options = options || {};

  const skip = options.skip || 0;
  const limit = options.limit;
  const sort = options.sort || {};

  const nqmMeta = options.nqmMeta || false;

  const selectQuery = {
    distinct: distinct,
    table: sqliteConstants.DATABASE_DATA_TABLE_NAME,
    type: "select",
    where: filter,
  };

  // Set the limit for the number of documents that need to be retrieved
  selectQuery.limit = queryLimit;
  if (limit && (limit < queryLimit || limit < 0)) {
    // use custom limit if limit == 0
    // MongoDB limit < 0 is different from SQLite limit < 0
    // TODO: somehow solve this?
    selectQuery.limit = limit;
  }

  // Set the offset aka skip in mongodb
  if (skip) {
    selectQuery.offset = skip;
  }

  // Set the sort order (ascending or descending)
  const sortQuery = {};
  _.forEach(sort, (value, key) => {
    if (value === 1) {
      sortQuery[key] = sqliteConstants.SQLITE_SORT_TYPE_ASC;
    } else if (value === -1) {
      sortQuery[key] = sqliteConstants.SQLITE_SORT_TYPE_DESC;
    }
  });

  if (!_.isEmpty(sortQuery)) {
    selectQuery.order = sortQuery;
  }

  // Set the projection columns
  const schema = await module.exports.getGeneralSchema(db);
  const excludedColumns = Object.keys(schema);
  const includedColumns = [];
  _.forEach(projection, (value, key) => {
    if (key in schema) {
      if (value) {
        includedColumns.push(key);
      } else {
        const keyIdx = excludedColumns.indexOf(key);
        if (keyIdx >= 0) {
          excludedColumns.splice(keyIdx, 1);
        }
      }
    }
  });

  if (includedColumns.length) {
    selectQuery.columns = includedColumns;
  } else if (excludedColumns.length && !includedColumns.length) {
    selectQuery.columns = excludedColumns;
  }

  const distinctKey = includedColumns[0] || "";
  const sqliteTranslation = builder.sql(selectQuery, []);

  // Set the return value
  let result;

  if (distinct === false) {
    result = {
      data: [],
      metaData: {},
      metaDataUrl: "",
    };

    if (nqmMeta) {
      result.metaData = await module.exports.getResource(db);
    }
  } else {
    result = [];
  }

  // Return early if no columns selected
  if (selectQuery.columns.length === 1 && selectQuery.columns[0] === "*") {
    return result;
  }

  // Return early if no columns selected if no projection selected or more fields selected
  if (distinct === true && includedColumns.length !== 1) {
    return result;
  }

  // Return early if selected distinct on ndarrays
  // Not implemented function
  if (schema[distinctKey] === sqliteConstants.SQLITE_GENERAL_TYPE_NDARRAY && distinct === true) {
    return result;
  }

  // Read the sqlite data
  const rows = await db.allAsync(sqliteTranslation.query, sqliteTranslation.values);

  // Check if there's an object or array type in the generalSchema object
  // Convert each element of the rows
  // Becomes slow if one of the types is object or array
  if (_.includes(schema, sqliteConstants.SQLITE_GENERAL_TYPE_NDARRAY) ||
      _.includes(schema, sqliteConstants.SQLITE_GENERAL_TYPE_OBJECT) ||
      _.includes(schema, sqliteConstants.SQLITE_GENERAL_TYPE_ARRAY)
  ) {
    // Check if it's not select distinct
    if (distinct === false) {
      _.forEach(rows, (row) => {
        const convertedRow = {};

        _.forEach(row, (value, key) => {
          convertedRow[key] = sqliteConverter.convertToTdx(schema[key], value);
        });

        result.data.push(convertedRow);
      });
    } else {
      // const key = includedColumns[0];
      _.forEach(rows, (row) => {
        result.push(sqliteConverter.convertToTdx(schema[distinctKey], row[distinctKey]));
      });
    }
  } else {
    if (distinct === false) {
      result.data = rows;
    } else {
      // const key = includedColumns[0];

      _.forEach(rows, (row) => {
        result.push(row[distinctKey]);
      });
    }
  }

  // Read the ndarray files
  // Distinct is not implemented for ndarrays
  if (distinct === false) {
    // Get the ndarray keys
    const ndarrayKeys = findCollectionKeys(schema, sqliteConstants.SQLITE_GENERAL_TYPE_NDARRAY);
    if (ndarrayKeys.length > 0) {
    // eslint-disable-next-line require-atomic-updates
      result.data = await sqliteNdarray.readNdarrayMany(db, result.data, ndarrayKeys);
    }
  }

  return result;
}

/**
 * Updates data in a dataset resource.
 * @alias module:sqlite-manager.updateData
 * @async
 * @param {object} db - The sqlite3 db object from module node-sqlite3.
 * @param {DataRow|DataRow[]} data - The data to update.
 *     Must conform to the schema defined by the resource metadata.
 *     Supports updating individual or multiple rows.
 * @param {boolean} [upsert=false] - Indicates the data should be created if no
 *     document/row is found matching the primary key.
 * @param {boolean} [throws=true] - Indicates whether this function should reject
 *     if there is an error. The TDX-API doesn't, as it returns a field which
 *     states if there has been an error.
 * @returns {Promise<CommandResult>} - Use the result property to check for
 *     errors.
 */
module.exports.updateData = async function(
  db, data, upsert = false, throws = true) {
  // See https://www.sqlite.org/lang_UPSERT.html for more info.

  const schema = await module.exports.getGeneralSchema(db);
  const dataToConvert = [].concat(data);
  const sqlData = dataToConvert.map((row) => {
    return sqliteConverter.convertRowToSqlite(schema, row);
  });
  const infoTable = await sqliteInfoTable.getInfoKeys(db, ["schema"]);
  const uniqueIndex = infoTable[0].schema.uniqueIndex;

  // set function for creating SQLite String, either INSERT/UPDATE
  let makeSqlStatementStr = (dataRowKeys) => {
    return sqliteCreator.updateStatement(uniqueIndex, schema, dataRowKeys);
  };
  if (upsert) {
    makeSqlStatementStr = (dataRowKeys) => {
      return sqliteCreator.insertStatement(
        uniqueIndex, schema, dataRowKeys, upsert);
    };
  }

  const promisedResult = sqliteHelper.executeMany(db, makeSqlStatementStr,
    sqlData);

  const commandResult = await makeEmptyCommandResult();
  try {
    await promisedResult;
  } catch (error) {
    if (throws) {
      throw error;
    } else {
      commandResult.result.errors.push(error);
      return commandResult;
    }
  }
  commandResult.response = "Success";
  return commandResult;
};

/**
 * Updates data in a dataset-based resource using a query to specify the documents to be updated.
 * @alias module:sqlite-manager.updateDataByQuery
 * @param {object} db - The sqlite3 db object from module node-sqlite3.
 * @param {object} query - The query that specifies the data to update. All documents matching the
 * query will be updated.
 * @param {object} update - The update object with field data to be replaced.
 * @return  {Promise<object>}
 *    The promise with the total count of rows updated.
 * @example <caption>updates multiple documents</caption>
 * // Update all documents with English lsoa, setting `count` to 1000.
 * manager.updateDataByQuery(db, {lsoa: {$regex: "E*"}}, {count: 1000});
 */
module.exports.updateDataByQuery = function(db, query, update) {
  let whereClause = "";

  // Set the default values
  query = query || {};
  update = update || {};

  const updateQuery = {
    table: sqliteConstants.DATABASE_DATA_TABLE_NAME,
    type: "update",
    updates: update,
    where: query,
  };

  const countQuery = {
    table: sqliteConstants.DATABASE_DATA_TABLE_NAME,
    type: "select",
    where: query,
  };

  // Return early if update is empty
  if (_.isEmpty(update)) {
    return Promise.resolve({count: 0});
  }

  // Built the count and update queries using the filter
  const sqliteUpdateTranslation = builder.sql(updateQuery, []);

  // Built the count and update queries using the filter
  const sqliteCountTranslation = builder.sql(countQuery, []);

  // Copy the where clause if exists
  const clauseIdx = sqliteCountTranslation.query.indexOf("where");
  if (clauseIdx >= 0) {
    whereClause = ` ${sqliteCountTranslation.query.slice(clauseIdx)}`;
  }

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      let result = {};

      // Count the total number of rows in the dataset for a given query
      db.get(
        `SELECT Count(*) AS count FROM ${sqliteConstants.DATABASE_DATA_TABLE_NAME}${whereClause};`,
        sqliteCountTranslation.values,
        (error, row) => {
          if (error) {
            reject(error);
          } else {
            result = row;
          }
        },
      );

      db.run(`${sqliteUpdateTranslation.query};`, sqliteUpdateTranslation.values, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  });
};


/**
 * Truncates the dataset resource.
 * @function
 * @alias module:sqlite-manager.truncateResource
 * @param {object} db - The sqlite3 db object from module node-sqlite3.
 * @return  {object} - The promise with the total count of rows deleted.
 */
module.exports.truncateResource = function(db) {
  let sqlResult = {};
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Count the total number of rows in the dataset
      db.get(`SELECT Count(*) AS count FROM ${sqliteConstants.DATABASE_DATA_TABLE_NAME};`, [], (error, row) => {
        if (error) {
          reject(error);
        } else {
          sqlResult = row;
        }
      });

      db.run(`DELETE FROM ${sqliteConstants.DATABASE_DATA_TABLE_NAME};`, [], (error) => {
        if (error) {
          reject(error);
        }
      });

      db.run("VACUUM;", [], (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  })
    .then(() => {
    // Delete the ndarray data (not the folder)
      const datFiles = path.join(db.dataFolder, `*${sqliteConstants.DATABASE_DATA_SUFFIX}`);
      return del.sync(datFiles, {force: true});
    })
    .then(() => {
      return Promise.resolve(sqlResult);
    });
};

/**
 * Deletes data from a dataset-based resource.
 * @function
 * @async
 * @alias module:sqlite-manager.deleteData
 * @param {object} db - The sqlite3 db object from module node-sqlite3.
 * @param  {DataRow|DataRow[]} data - The primary key data to delete.
 * @param  {boolean} [doNotThrow=false]
 *    set to override default error handling.
 */
module.exports.deleteData = async function(db, data, doNotThrow) {
  if (doNotThrow) {
    throw Error(
      "doNotThrow is currently unimplemented, just try/catch your code");
  }
  const schema = await module.exports.getGeneralSchema(db);
  const dataToConvert = [].concat(data); // make sure data is an array
  const sqlData = dataToConvert.map((row) => {
    return sqliteConverter.convertRowToSqlite(schema, row);
  });
  const infoTable = await sqliteInfoTable.getInfoKeys(db, ["schema"]);
  const uniqueIndex = infoTable[0].schema.uniqueIndex;
  if (uniqueIndex.length === 0) {
    throw Error("Cannot use deleteData() on a dataset with no uniqueIndex." +
      " Try using deleteDataByQuery() instead.");
  }

  // set function for creating SQLite Delete String
  const makeSqlStatementStr = (dataRowKeys) => {
    return sqliteCreator.deleteStatement(uniqueIndex, dataRowKeys);
  };

  await sqliteHelper.executeMany(db, makeSqlStatementStr, sqlData);
};

/**
 * Gets a count of the data in a dataset-based resource, after applying the given filter.
 * @function
 * @alias module:sqlite-manager.getDatasetDataCount
 * @param {object} db - The sqlite3 db object from module node-sqlite3.
 * @param {object} filter
 *   An optional mongodb filter to apply before counting the data.
 * @return  {object} - The promise with the total count of rows.
 */
module.exports.getDatasetDataCount = function(db, filter) {
  let whereClause = "";
  filter = filter || {};

  const countQuery = {
    table: sqliteConstants.DATABASE_DATA_TABLE_NAME,
    type: "select",
    where: filter,
  };

  // Build the count query using the filter
  const sqliteTranslation = builder.sql(countQuery, []);

  // Copy the where clause if exists
  const clauseIdx = sqliteTranslation.query.indexOf("where");
  if (clauseIdx >= 0) {
    whereClause = ` ${sqliteTranslation.query.slice(clauseIdx)}`;
  }

  return db.getAsync(
    `SELECT Count(*) AS count FROM ${sqliteConstants.DATABASE_DATA_TABLE_NAME}${whereClause};`,
    sqliteTranslation.values);
};

/**
 * Gets the details for a given database.
 * @async
 * @function
 * @alias module:sqlite-manager.getResource
 * @param  {object} db - The sqlite3 db object from module node-sqlite3.
 * @param  {boolean} [noThrow=false] - If set, the call won't reject or throw if the resource doesn't exist.
 * @return  {Promise<Resource>}
 * @exception  Will throw/reject if the resource is not found (see `noThrow` flag) or permission is denied.
 */
module.exports.getResource = async function(db, noThrow) {
  const keysToDisplayKeys = sqliteConstants.INFO_TABLE_KEYS_TO_TDX_RESOURCE_KEYS;

  if (noThrow) {
    throw Error("noThrow is currently unimplemented, just try/catch your code");
  }
  const infoKeys = await sqliteInfoTable.getInfoKeys(
    db,
    Object.keys(keysToDisplayKeys),
  );
  const resource = {};
  const defaultValue = null;
  // fill up resource with the default values
  for (const key in keysToDisplayKeys) {
    const displayKey = keysToDisplayKeys[key];
    resource[displayKey] = defaultValue;
  }
  // map keys from info table to TDX Resource definition.
  for (const infoKey of infoKeys) {
    for (const key in infoKey) {
      resource[keysToDisplayKeys[key]] = infoKey[key];
    }
  }
  return resource;
};

/**
 * Returns the ndarray metadata
 * @function
 * @alias module:sqlite-ndarray.getNdarrayMeta
 * @sync
 * @param {Buffer|{object: any}} data - The input data buffer or data stream.
 * @param {string} [dtype] - The data type is of type `NDARRAY_DTYPES`.
 * @param {array} [shape] - The shape of the data.
 * @param {boolean} [major] - The data major (true - row-major, false - column-major).
 * @param {string} [ftype] - The ndarray file type is of type `NDARRAY_FTYPES`.
 * @returns {object} - The ndarray metadata.
 */
module.exports.getNdarrayMeta = sqliteNdarray.getNdarrayMeta;

/**
 * Returns the Javascript typed array from a buffer of a given type
 * @function
 * @alias module:sqlite-ndarray.getTypedArrayFromBuffer
 * @sync
 * @param {Buffer} buffer - The data buffer.
 * @param {string} dtype - The data type is of type `NDARRAY_DTYPES`.
 * @returns {object} - The typed array.
 */
module.exports.getTypedArrayFromBuffer = sqliteNdarray.getTypedArrayFromBuffer;
