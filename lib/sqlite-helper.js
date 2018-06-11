/**
 * Module to insert data into a db.
 * @module sqlite-helper
 * @author Alexandru Mereacre <mereacre@gmail.com>
 */

module.exports = (function() {
  "use strict";

  const _ = require("lodash");
  const Promise = require("bluebird");

  const helper = {};

  /**
   * Execute the sqlite db run command using the prepared statement
   * @function
   * @alias module:sqlite-helper.executeInsert
   * @param {object} db - The sqlite3 db object from module node-sqlite3.
   * @param {string} query - The sqlite query to execute
   * @param {array[]} data - Array of arrays of data
   * @param {object} schema - The general schema.
   * @returns {object} - The promise with a count for the total number of documents added or error
   */
  helper.executeInsert = function(db, query, data) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        const statement = db.prepare(query, [], (error) => {
          if (error) {
            statement.finalize();
            reject(error);
          }
        });

        _.forEach(data, (row) => {
          statement.run(row, (error) => {
            if (error) {
              statement.finalize();
              reject(error);
            }
          });
        });

        statement.finalize(() => {
          resolve({count: data.length});
        });
      });
    });
  };

  return helper;
}());