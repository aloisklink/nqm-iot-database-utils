/**
 * Module to convert a tdx schema into a sqlite schema.
 * @module sqlite-schema-converter
 * @author Alexandru Mereacre <mereacre@gmail.com>
 */

module.exports = (function() {
  "use strict";

  const _ = require("lodash");
  const sqliteConstants = require("./sqlite-constants.js");

  const converter = {};

  /**
   * Returns a basic sqlite type from an array of tdx types.
   * @function
   * @param {string[]} tdxType - The array of tdx types
   * @returns {string} - The sqlite basic type
   */
  converter.getBasicType = function(tdxTypes) {
    let tdxBaseType = tdxTypes[0] || "";
    let tdxDerivedType = tdxTypes[1] || "";

    // Transform the types to a lower and upper standard forms
    if (typeof tdxBaseType === "string")
      tdxBaseType = tdxBaseType.toLowerCase();

    if (typeof tdxDerivedType === "string")
      tdxDerivedType = tdxDerivedType.toUpperCase();

    // Check the base tdx type
    switch (tdxBaseType) {
      case sqliteConstants.TDX_TYPE_STRING:
        return sqliteConstants.SQLITE_TYPE_TEXT;
      case sqliteConstants.TDX_TYPE_BOOLEAN:
        return sqliteConstants.SQLITE_TYPE_NUMERIC;
      case sqliteConstants.TDX_TYPE_DATE:
        return sqliteConstants.SQLITE_TYPE_NUMERIC;
      case sqliteConstants.TDX_TYPE_NUMBER:
        if (tdxDerivedType.indexOf(sqliteConstants.TDX_TYPE_INT) >= 0)
          return sqliteConstants.SQLITE_TYPE_INTEGER;
        else if (new RegExp(sqliteConstants.TDX_TYPE_REAL).test(tdxDerivedType))
          return sqliteConstants.SQLITE_TYPE_REAL;
        else
          return sqliteConstants.SQLITE_TYPE_NUMERIC;
    }

    // If no type specified return the default text type
    return sqliteConstants.SQLITE_TYPE_TEXT;
  };

  /**
   * Maps a general sqlite schema type into a valid sqlite schema.
   * @function
   * @alias module:sqlite-schema-converter.mapSchema
   * @param {object} types - The general sqlite schema type
   * @returns {object} - The mapped valid sqlite schema
   */
  converter.mapSchema = function(types) {
    const sqliteSchema = {};

    _.forEach(types, (value, key) => {
      switch (value) {
        case sqliteConstants.SQLITE_GENERAL_TYPE_OBJECT:
          sqliteSchema[key] = sqliteConstants.SQLITE_TYPE_TEXT;
          break;
        case sqliteConstants.SQLITE_GENERAL_TYPE_ARRAY:
          sqliteSchema[key] = sqliteConstants.SQLITE_TYPE_TEXT;
          break;
        default:
          sqliteSchema[key] = value;
          break;
      }
    });

    return sqliteSchema;
  };

  /**
   * Converts a tdx schema into a sqlite schema.
   * @function
   * @alias module:sqlite-schema-converter.convertSchema
   * @param {object} schema - The tdx schema
   * @returns {object} - The sqlite schema
   */
  converter.convertSchema = function(schema) {
    const sqliteSchema = {};

    _.forEach(schema, (value, key) => {
      // Check if the type is an array, an object or a basic type
      if (_.isArray(value))
        sqliteSchema[key] = sqliteConstants.SQLITE_GENERAL_TYPE_ARRAY;
      else if (!_.isArray(value) && _.isObject(value)) {
        if (value.hasOwnProperty(sqliteConstants.TDX_TYPE_NAME))
          sqliteSchema[key] = converter.getBasicType(value[sqliteConstants.TDX_TYPE_NAME]);
        else
          sqliteSchema[key] = sqliteConstants.SQLITE_GENERAL_TYPE_OBJECT;
      }
    });

    return sqliteSchema;
  };

  /**
   * Converts a tdx value to a sqlite value based on a sqlite type.
   * @function
   * @alias module:sqlite-schema-converter.convertToSqlite
   * @param {string} type - Sqlite type to convert the value to
   * @param {string} value - TDX value to convert from
   * @param {string} options - optional addition options
   * @param  {string} [options.onlyStringify] - set to true to turn off the doubel quotest replacement and delimiter addition
   * @returns {number|string} - The converted value. If it is an unrecognized type it will return null.
   */
  converter.convertToSqlite = function(type, value, options) {
    let result;

    options = options || {};

    const onlyStringify = options["onlyStringify"] || false;

    switch (type) {
      case sqliteConstants.SQLITE_GENERAL_TYPE_OBJECT:
      case sqliteConstants.SQLITE_GENERAL_TYPE_ARRAY:
        result = (onlyStringify) ? JSON.stringify(value) : `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        break;
      case sqliteConstants.SQLITE_TYPE_NUMERIC:
      case sqliteConstants.SQLITE_TYPE_INTEGER:
      case sqliteConstants.SQLITE_TYPE_REAL:
        result = value;
        break;
      case sqliteConstants.SQLITE_TYPE_TEXT:
        result = (onlyStringify) ? value : `"${value.replace(/"/g, '""')}"`;
        break;
      default:
        result = null;
    }

    return result;
  };

  /**
   * Converts a sqlite value to a tdx value based on a sqlite type.
   * @function
   * @alias module:sqlite-schema-converter.convertToTdx
   * @param {string} type - Sqlite type to convert the value to
   * @param {string} value - SQlite value to convert from
   * @returns {number|string|array|object} - The converted value. If it is an unrecognized type it will return null.
   */
  converter.convertToTdx = function(type, value) {
    let result;

    switch (type) {
      case sqliteConstants.SQLITE_GENERAL_TYPE_OBJECT:
      case sqliteConstants.SQLITE_GENERAL_TYPE_ARRAY:
        result = JSON.parse(value);
        break;
      case sqliteConstants.SQLITE_TYPE_NUMERIC:
      case sqliteConstants.SQLITE_TYPE_INTEGER:
      case sqliteConstants.SQLITE_TYPE_REAL:
        result = value;
        break;
      case sqliteConstants.SQLITE_TYPE_TEXT:
        result = value;
        break;
      default:
        result = null;
    }

    return result;
  };

  return converter;
}());

// Tdx types
// {"__tdxType": ["number"]}
// {"__tdxType": ["string"]}
// {"__tdxType": ["boolean"]}
// {"__tdxType": ["date"]}
// []
// ["string"]
// {prop1: {}, prop2: {}}
// [{__tdxType": ["type"]}]