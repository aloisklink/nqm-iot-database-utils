/**
 * Module to manage the sqlite database.
 * @module sqlite-manager
 * @author Alexandru Mereacre <mereacre@gmail.com>
 */

module.exports = (function() {
  "use strict";

  const _ = require("lodash");
  const sqlite3 = require("sqlite3");
  const Promise = require("bluebird");
  const shortid = require("shortid");
  const builder = require("mongo-sql");
  const sqliteConstants = require("./sqlite-constants.js");
  const sqliteInfoTable = require("./sqlite-info-table.js");
  const sqliteConverter = require("./sqlite-schema-converter.js");
  const sqliteHelper = require("./sqlite-helper.js");

  const manager = {};
  let datasetMetadata = {};
  let datasetMetadataUrl = "";
  let generalSchema = {};
  let queryLimit = sqliteConstants.SQLITE_QUERY_LIMIT;

  Promise.promisifyAll(sqlite3);

  /**
   * @typedef  {object} DatasetData
   * @property  {object} metaData - The dataset metadata (see `nqmMeta` option in `getDatasetData`).
   * @property  {string} metaDataUrl - The URL to the dataset metadata (see `nqmMeta` option in `getDatasetData`.
   * @property  {object[]} data - The dataset documents.
   */

  /**
   * Opens a sqlite database. Creates if none exists.
   * @function
   * @alias module:sqlite-manager.openDatabase
   * @param {string} path - The path of the db
   * @param {string} type - The type of the db: "file" or "memory"
   * @param {string} mode - The open mode of the db: "w+" or "rw" or "r"
   * @returns {object} - Returns the promise with the sqlite3 db object from module node-sqlite3
   */
  manager.openDatabase = function(path, type, mode) {
    let db;
    return new Promise((resolve, reject) => {
      const databasePath = (type === sqliteConstants.DATABASE_FILE_TYPE) ? path : sqliteConstants.DATABASE_MEMORY_MODE;
      let databaseMode = sqlite3.OPEN_READONLY;

      if (mode === "w+") // Create for read and write
        databaseMode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
      else if (mode === "rw" || mode === "wr") // Open for read and write
        databaseMode = sqlite3.OPEN_READWRITE;
      else if (mode === "r") // Open only for read
        databaseMode = sqlite3.OPEN_READONLY;

      db = new sqlite3.Database(databasePath, databaseMode, (error) => {
        if (error) reject(error);
        else resolve();
      });
    })
    .then(() => {
      // Check if info table exists (the dataset might not be created yet)
      return sqliteInfoTable.checkInfoTable(db);
    })
    .then((result) => {
      // Get the tdx schema definition
      if (result)
        return sqliteInfoTable.getInfoKeys(db, ["schema"])
          .then((tdxSchema) => {
            if (tdxSchema.length) {
              // Dataset schema definition
              tdxSchema[0]["schema"] = tdxSchema[0]["schema"] || {};

              // Dataset data schema
              tdxSchema[0]["schema"]["dataSchema"] = tdxSchema[0]["schema"]["dataSchema"] || {};

              return Promise.resolve(sqliteConverter.convertSchema(tdxSchema[0]["schema"]["dataSchema"]));
            } else
              return Promise.resolve({});
          });
      else
        return Promise.resolve({});
    })
    .then((schema) => {
      // Assign the generqal schema if the info table exists and the dataset exists
      // Will be empty otherwise
      setGeneralSchema(schema);
      return Promise.resolve(db);
    });
  };

  /**
   * Closes a sqlite database.
   * @function
   * @alias module:sqlite-manager.closeDatabase
   * @param {object} db - The sqlite3 db object from module node-sqlite3
   * @returns {object} - The empty promise or error
   */
  manager.closeDatabase = function(db) {
    return new Promise((resolve, reject) => {
      db.close((error) => {
        if (error) reject(error);
        else {
          // Clean the general schema
          setGeneralSchema({});
          resolve({});
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
   * @param  {object} [options.derived] - definition of derived filter, implying this resource is a view on an existing dataset.
   * @param  {object} [options.derived.filter] - the (read) filter to apply, in mongodb query format,
   * e.g. `{"temperature": {"$gt": 15}}` will mean that only data with a temperature value greater than 15 will be
   * available in this view. The filter can be any arbitrarily complex mongodb query. Use the placeholder
   * `"@@_identity_@@"` to indicate that the identity of the currently authenticated user should be substituted.
   * For example, if the user `bob@acme.com/tdx.acme.com` is currently authenticated, a filter of `{"username":
   *  "@@_identity_@@"}` will resolve at runtime to `{"username": "bob@acme.com/tdx.acme.com"}`.
   * @param  {object} [options.derived.projection] - the (read) projection to apply, in mongodb projection format,
   * e.g. `{"timestamp": 1, "temperature": 1}` implies only the 'timestamp' and 'temperature' properties will be
   * returned.
   * @param  {string} [options.derived.source] - the id of the source dataset on which to apply the filters and
   * projections.
   * @param  {object} [options.derived.writeFilter] - the write filter to apply, in mongodb query format. This
   * controls what data can be written to the underlying source dataset. For example, a write filter of
   * `{"temperature": {"$lt": 40}}` means that attempts to write a temperature value greater than or equal to `40`
   * will fail. The filter can be any arbitrarily complex mongodb query.
   * @param  {object} [options.derived.writeProjection] - the write prdbMemojection to apply, in mongodb projection format.
   * This controls what properties can be written to the underlying dataset. For example, a write projection of
   * `{"temperature": 1}` means that only the temperature field can be written, and attempts to write data to other
   * properties will fail. To allow a view to create new data in the underlying dataset, the primary key fields
   * must be included in the write projection.
   * @param  {string} [options.description] - a description for the resource.
   * @param  {string} [options.id] - the requested ID of the new resource. Must be unique. Will be auto-generated if
   * omitted (recommended).
   * @param  {string} options.name - the name of the resource. Must be unique in the parent folder.
   * @param  {object} [options.meta] - a free-form object for storing metadata associated with this resource.
   * @param  {string} [options.parentId] - the id of the parent resource. If omitted, will default to the appropriate
   * root folder based on the type of resource being created.
   * @param  {string} [options.provenance] - a description of the provenance of the resource. Markdown format is
   * supported.
   * @param  {object} [options.schema] - optional schema definition.
   * @param  {object} [options.schema.dataSchema] - data schema definition object. Has TDX object structure.
   * @param  {object[]} [options.schema.uniqueIndex] - array of key value pairs denoting the ascending or descending order of the columns.
   * @param  {string} [options.shareMode] - the share mode assigned to the new resource. One of [`"pw"`, `"pr"`,
   * `"tr"`], corresponding to "public read/write", "public read/trusted write", "trusted only".
   * @param  {string[]} [options.tags] - a list of tags to associate with the resource.
   * @returns {object} - The id of the dataset created
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
  manager.createDataset = function(db, options) {
    // Dataset id
    options["id"] = options["id"] || "";

    // Dataset schema definition
    const schemaDefinition = options["schema"] || {};

    // Dataset data schema
    const dataSchema = schemaDefinition["dataSchema"] || {};

    // Dataset primary key definitoin
    const uniqueIndex = schemaDefinition["uniqueIndex"] || [];

    if (options["id"] === "") options["id"] = shortid.generate();

    const keyValuePairs = _.map(options, (value, key) => {
      const pair = {};
      pair[key] = value;
      return pair;
    });

    return sqliteInfoTable.createInfoTable(db)
      .then(() => {
        return sqliteInfoTable.setInfoKeys(db, keyValuePairs);
      })
      .then(() => {
        // Convert from tdx to a general sqlite schema
        // Assign to general schema
        setGeneralSchema(sqliteConverter.convertSchema(dataSchema));

        // Map the converted schema to a valid sqlite schema and them map it to a string
        const sqliteSchemaKeys = _.map(sqliteConverter.mapSchema(generalSchema), (value, key) => {
          return `${key} ${value}`;
        });
        
        let tableColumnStr = "";
        // Create the sqlite "CREATE TABLE" query index definition
        _.forEach(sqliteSchemaKeys, (value, idx) => {
          tableColumnStr += `${value}${(idx < sqliteSchemaKeys.length - 1) ? "," : ""}`;
        });

        // Create the sqlite "CREATE TABLE" query primary key definition
        let sqlitePrimaryKeyStr = "";

        _.forEach(uniqueIndex, (value, idx) => {
          let sortType = sqliteConstants.SQLITE_SORT_TYPE_ASC;
          let sortValue = "";

          // Differentiate between ascending and descending sorting
          if (value["asc"] !== undefined)
            sortValue = value["asc"];
          else if (value["desc"] !== undefined) {
            sortType = sqliteConstants.SQLITE_SORT_TYPE_DESC;
            sortValue = value["desc"];
          }

          const endComma = (idx < uniqueIndex.length - 1) ? "," : "";

          sqlitePrimaryKeyStr += `${sortValue} ${sortType}${endComma}`;
        });

        let createPromise = Promise.resolve({});
        if (tableColumnStr !== "") {
          // Create the table without the index
          const createTableQuery = `CREATE TABLE ${sqliteConstants.DATABASE_DATA_TABLE_NAME}(${tableColumnStr})`;
          createPromise = db.runAsync(createTableQuery, []);

          if (sqlitePrimaryKeyStr !== "")
            // Create the index
            createPromise = createPromise.then(() => {
              return db.runAsync(`CREATE UNIQUE INDEX ${sqliteConstants.DATABASE_TABLE_INDEX_NAME} ON ${sqliteConstants.DATABASE_DATA_TABLE_NAME}(${sqlitePrimaryKeyStr})`, []);
            });
        }

        return createPromise;
      })
      .then(() => {
        // Return the id of the table can be generated or given as a parameter
        return Promise.resolve(options["id"]);
      });
  };

  /**
   * Returns the general schema.
   * @function
   * @alias module:sqlite-manager.getGeneralSchema
   * @returns {object} - The general schema object
   */
  manager.getGeneralSchema = function() {
    return generalSchema;
  };

  /**
   * Add data to a dataset resource.
   * @function
   * @alias module:sqlite-manager.addData
   * @param {object} db - The sqlite3 db object from module node-sqlite3.
   * @param {object|array} data - The data to add. Must conform to the schema defined by the resource metadata. Supports creating an individual document or many documents.
   * @return  {object} - The promise with the total couint of rows added.
   * @example <caption>create an individual document</caption>
   * manager.addData(db, {lsoa: "E0000001", count: 398});
   * @example <caption>create multiple documents</caption>
   * manager.addData(db, [
   *  {lsoa: "E0000001", count: 398},
   *  {lsoa: "E0000002", count: 1775},
   *  {lsoa: "E0000005", count: 4533},
   * ]);
   */
  manager.addData = function(db, data) {
    const columnNames = Object.keys(generalSchema);
    const sqlData = [].concat(data);
    const queryData = [];
    let tableColumnStr = "";
    let sqliteValue = "";

    // Create the sqlite INSERT column string
    _.forEach(columnNames, (column, idx) => {
      tableColumnStr += column + ((idx < columnNames.length - 1) ? "," : "");
      sqliteValue += `?${(idx < columnNames.length - 1) ? "," : ""}`;
    });

    // Iterate over all the elements and create the value string
    _.forEach(sqlData, (element) => {
      const row = [];
      let transformedValue;

      _.forEach(columnNames, (column) => {
        // Convert from tdx values to sqlite values
        if (element[column] === undefined)
          transformedValue = sqliteConstants.SQLITE_NULL_VALUE;
        else
          transformedValue = sqliteConverter.convertToSqlite(generalSchema[column], element[column], {onlyStringify: true});

        row.push(transformedValue);
      });
      queryData.push(row);
    });

    const insertQuery = `INSERT INTO ${sqliteConstants.DATABASE_DATA_TABLE_NAME} (${tableColumnStr}) VALUES (${sqliteValue});`;
    return sqliteHelper.executeInsert(db, insertQuery, queryData);
  };

  /**
   * Gets all data from the given dataset that matches the filter provided.
   * @alias module:sqlite-manager.getDatasetData
   * @param {object} db - The sqlite3 db object from module node-sqlite3.
   * @param  {object} [filter] - A mongodb filter object. If omitted, all data will be retrieved.
   * @param  {object} [projection] - A mongodb projection object. Should be used to restrict the payload to the
   * minimum properties needed if a lot of data is being retrieved.
   * @param  {object} [options] - A mongodb options object. Can be used to limit, skip, sort etc. Note a default
   * `limit` of 1000 is applied if none is given here.
   * @param  {bool} [options.nqmMeta] - When set, the resource metadata will be returned along with the dataset
   * data. Can be used to avoid a second call to `getResource`. Otherwise a URL to the metadata is provided.
   * @return  {DatasetData}
   */
  manager.getDatasetData = function(db, filter, projection, options) {
    // Set the default values
    filter = filter || {};
    projection = projection || {};
    options = options || {};

    const skip = options["skip"] || 0;
    const limit = options["limit"];
    const sort = options["sort"] || {};

    const nqmMeta = options["nqmMeta"] || false;

    const selectQuery = {
      type: "select",
      table: sqliteConstants.DATABASE_DATA_TABLE_NAME,
      where: filter,
    };

    // Set the limit for the number of documents that need to be retrieved
    if (limit === undefined)
      selectQuery["limit"] = queryLimit;
    else {
      if (limit > queryLimit)
        selectQuery["limit"] = queryLimit;
      else if (limit > 0 && limit <= queryLimit)
        selectQuery["limit"] = limit;
    }

    // Set the offset aka skip in mongodb
    if (skip) selectQuery["offset"] = skip;

    // Set the sort order (ascending or descending)
    const sortQuery = {};
    _.forEach(sort, (value, key) => {
      if (value === 1)
        sortQuery[key] = sqliteConstants.SQLITE_SORT_TYPE_ASC;
      else if (value === -1)
        sortQuery[key] = sqliteConstants.SQLITE_SORT_TYPE_DESC;
    });

    if (!_.isEmpty(sortQuery)) selectQuery["order"] = sortQuery;

    // Set the projection columns
    const excludedColumns = Object.keys(generalSchema);
    const includedColumns = [];
    _.forEach(projection, (value, key) => {
      if (key in generalSchema) {
        if (value)
          includedColumns.push(key);
        else {
          const keyIdx = excludedColumns.indexOf(key);
          if (keyIdx >= 0) excludedColumns.splice(keyIdx, 1);
        }
      }
    });

    if (includedColumns.length)
      selectQuery["columns"] = includedColumns;
    else if (excludedColumns.length && !includedColumns.length)
      selectQuery["columns"] = excludedColumns;

    const sqliteTranslation = builder.sql(selectQuery);

    // Set the return value
    const result = {
      metaDataUrl: datasetMetadataUrl,
      data: [],
    };

    if (nqmMeta) result["metaData"] = datasetMetadata;

    // Return early if no columns selected
    if (selectQuery["columns"].length === 1 && selectQuery["columns"][0] === "*")
      return Promise.resolve(result);

    return db.allAsync(sqliteTranslation.query, sqliteTranslation.values)
      .then((rows) => {
        // Check if there's an object or array type in the generalSchema object
        // Convert each element of the rows
        // Becomes slow if one of the types is object or array
        if (_.includes(generalSchema, sqliteConstants.SQLITE_GENERAL_TYPE_OBJECT, sqliteConstants.SQLITE_GENERAL_TYPE_ARRAY)) {
          _.forEach(rows, (row) => {
            const convertedRow = {};

            _.forEach(row, (value, key) => {
              convertedRow[key] = sqliteConverter.convertToTdx(generalSchema[key], value);
            });

            result.data.push(convertedRow);
          });
        } else result["data"] = rows;
        return Promise.resolve(result);
      });
  };

  /**
   * Truncates the dataset resource.
   * @function
   * @alias module:sqlite-manager.truncateResource
   * @param {object} db - The sqlite3 db object from module node-sqlite3.
   * @return  {object} - The promise with the total count of rows deleted.
   */
  manager.truncateResource = function(db) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        let result = {};
        // Count the total number of rows in the dataset
        db.get(`SELECT Count(*) AS count FROM ${sqliteConstants.DATABASE_DATA_TABLE_NAME};`, [], (error, row) => {
          if (error) reject(error);
          else result = row;
        });

        db.run(`DELETE FROM ${sqliteConstants.DATABASE_DATA_TABLE_NAME};`, [], (error) => {
          if (error) reject(error);
        });

        db.run("VACUUM;", [], (error) => {
          if (error) reject(error);
          else resolve(result);
        });
      });
    });
  };

  /**
   * Gets a count of the data in a dataset-based resource, after applying the given filter.
   * @function
   * @alias module:sqlite-manager.getDatasetDataCount
   * @param {object} db - The sqlite3 db object from module node-sqlite3.
   * @param {object} filter - An optional mongodb filter to apply before counting the data.
   * @return  {object} - The promise with the total count of rows.
   */
  manager.getDatasetDataCount = function(db, filter) {
    let whereClause = "";
    filter = filter || {};

    const countQuery = {
      type: "select",
      table: sqliteConstants.DATABASE_DATA_TABLE_NAME,
      where: filter,
    };

    // Builf the count query using the filter
    const sqliteTranslation = builder.sql(countQuery);

    // Copy the where clause if exists
    const clauseIdx = sqliteTranslation.query.indexOf("where");
    if (clauseIdx >= 0)
      whereClause = ` ${sqliteTranslation.query.slice(clauseIdx)}`;

    return db.getAsync(`SELECT Count(*) AS count FROM ${sqliteConstants.DATABASE_DATA_TABLE_NAME}${whereClause};`, sqliteTranslation.values);
  };

  /**
   * Sets the general schema and the default NULL array.
   * @function
   * @alias module:sqlite-manager.setGeneralSchema
   * @param {object} schema - The general schema.
   */
  function setGeneralSchema(schema) {
    generalSchema = schema;
  }

  return manager;
}());