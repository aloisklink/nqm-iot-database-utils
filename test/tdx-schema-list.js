exports.TDX_SCHEMA_LIST = [{// Test 1
  "schema": {
    "dataSchema": {
      "properties": {
        "area_id": {
          "__tdxType": [
            "string",
            "Geography",
            "Area",
            "Onscode",
          ],
        },
        "area_type": {
          "__tdxType": [
            "string",
            "Geography",
            "Area",
            "OnsCodeType",
          ],
        },
        "area_name": {
          "__tdxType": [
            "string",
            "Geography",
            "Area",
            "Onsname",
          ],
        },
      },
      "type": {
        "__tdxType": [
          "string",
        ],
      },
      "geometry": {
        "__tdxType": [
          "string",
        ],
      },
      "bbox": [],
    },
    "uniqueIndex": [
      {"asc": "type"},
      {"desc": "bbox"},
    ],
  },
  "sqliteSchema": {
    "properties": "TEXT",
    "type": "TEXT",
    "geometry": "TEXT",
    "bbox": "TEXT",
  },
  "generalSchema": {
    "properties": "OBJECT",
    "type": "TEXT",
    "geometry": "TEXT",
    "bbox": "ARRAY",
  },
  "sqliteIndex": "CREATE UNIQUE INDEX dataindex ON data(type ASC,bbox DESC)",
},
{// Test 2
  "schema": {
    "dataSchema": {
      "prop1": {
        "__tdxType": ["number"],
      },
    },
    "uniqueIndex": [{
      "asc": "prop1",
    }],
  },
  "sqliteSchema": {
    "prop1": "NUMERIC",
  },
  "generalSchema": {
    "prop1": "NUMERIC",
  },
  "sqliteIndex": "CREATE UNIQUE INDEX dataindex ON data(prop1 ASC)",
},
{// Test 3
  "schema": {
    "dataSchema": {
      "prop1": {
        "__tdxType": ["string"],
      },
    },
    "uniqueIndex": [{
      "desc": "prop1",
    }],
  },
  "sqliteSchema": {
    "prop1": "TEXT",
  },
  "generalSchema": {
    "prop1": "TEXT",
  },
  "sqliteIndex": "CREATE UNIQUE INDEX dataindex ON data(prop1 DESC)",
},
{// Test 4
  "schema": {
    "dataSchema": {
      "prop1": {
        "__tdxType": ["boolean"],
      },
    },
    "uniqueIndex": [],
  },
  "sqliteSchema": {
    "prop1": "NUMERIC",
  },
  "generalSchema": {
    "prop1": "NUMERIC",
  },
  "sqliteIndex": "",
},
{// Test 5
  "schema": {
    "dataSchema": {
      "prop1": {
        "__tdxType": ["date"],
      },
    },
    "uniqueIndex": [],
  },
  "sqliteSchema": {
    "prop1": "NUMERIC",
  },
  "generalSchema": {
    "prop1": "NUMERIC",
  },
  "sqliteIndex": "",
},
{// Test 6
  "schema": {
    "dataSchema": {
      "prop1": [],
    },
    "uniqueIndex": [{
      "asc": "prop1",
    }],
  },
  "sqliteSchema": {
    "prop1": "TEXT",
  },
  "generalSchema": {
    "prop1": "ARRAY",
  },
  "sqliteIndex": "CREATE UNIQUE INDEX dataindex ON data(prop1 ASC)",
},
{// Test 7
  "schema": {
    "dataSchema": {
      "prop1": ["string"],
    },
    "uniqueIndex": [{
      "desc": "prop1",
    }],
  },
  "sqliteSchema": {
    "prop1": "TEXT",
  },
  "generalSchema": {
    "prop1": "ARRAY",
  },
  "sqliteIndex": "CREATE UNIQUE INDEX dataindex ON data(prop1 DESC)",
},
{// Test 8
  "schema": {
    "dataSchema": {
      "prop1": [{
        "__tdxType": ["string"],
      }],
    },
    "uniqueIndex": [],
  },
  "sqliteSchema": {
    "prop1": "TEXT",
  },
  "generalSchema": {
    "prop1": "ARRAY",
  },
  "sqliteIndex": "",
},
{// Test 9
  "schema": {
    "dataSchema": {
      "ratio": {
        "__tdxType": [
          "number",
        ],
      },
      "gender": {
        "__tdxType": [
          "string",
          "Demography",
          "Gender",
        ],
      },
      "age_band": {
        "__tdxType": [
          "string",
          "Demography",
          "AgeBand",
        ],
      },
      "locked": {
        "__tdxType": [
          "boolean",
        ],
      },
    },
    "uniqueIndex": [
      {"asc": "ratio"},
      {"desc": "gender"},
      {"asc": "age_band"},
      {"desc": "locked"},
    ],
  },
  "sqliteSchema": {
    "ratio": "NUMERIC",
    "gender": "TEXT",
    "age_band": "TEXT",
    "locked": "NUMERIC",
  },
  "generalSchema": {
    "ratio": "NUMERIC",
    "gender": "TEXT",
    "age_band": "TEXT",
    "locked": "NUMERIC",
  },
  "sqliteIndex": "CREATE UNIQUE INDEX dataindex ON data(ratio ASC,gender DESC,age_band ASC,locked DESC)",
},
{// Test 10
  "schema": {
    "dataSchema": {
      "parent_id": {
        "__tdxType": [
          "number",
          "Float",
          "Area",
          "Onscode",
        ],
      },
      "parent_name": {
        "__tdxType": [
          "number",
          "double",
          "Area",
          "Onsname",
        ],
      },
      "parent_type": {
        "__tdxType": [
          "number",
          "REAL",
          "Area",
          "OnsCodeType",
        ],
      },
      "neighbour_id": {
        "__tdxType": [
          "number",
          "Double precision",
          "Area",
          "Onscode",
        ],
      },
      "neighbour_type": {
        "__tdxType": [
          "number",
          "FLOAT",
          "Area",
          "OnsCodeType",
        ],
      },
      "neighbour_name": {
        "__tdxType": [
          "number",
          "Integer",
          "Area",
          "Onsname",
        ],
      },
    },
    "uniqueIndex": [
      {"asc": "neighbour_type"},
      {"desc": "neighbour_name"},
    ],
  },
  "sqliteSchema": {
    "parent_id": "REAL",
    "parent_name": "REAL",
    "parent_type": "REAL",
    "neighbour_id": "REAL",
    "neighbour_type": "REAL",
    "neighbour_name": "INTEGER",
  },
  "generalSchema": {
    "parent_id": "REAL",
    "parent_name": "REAL",
    "parent_type": "REAL",
    "neighbour_id": "REAL",
    "neighbour_type": "REAL",
    "neighbour_name": "INTEGER",
  },
  "sqliteIndex": "CREATE UNIQUE INDEX dataindex ON data(neighbour_type ASC,neighbour_name DESC)",
},
{// Test 11
  "schema": {
    "dataSchema": {
      "prop1": {
        "__tdxType": ["number", "Double"],
      },
    },
    "uniqueIndex": [],
  },
  "sqliteSchema": {
    "prop1": "REAL",
  },
  "generalSchema": {
    "prop1": "REAL",
  },
  "sqliteIndex": "",
},
{// Test 12
  "schema": {
    "dataSchema": {
      "prop1": {
        "__tdxType": ["string"],
      },
    },
    "uniqueIndex": [],
  },
  "sqliteSchema": {
    "prop1": "TEXT",
  },
  "generalSchema": {
    "prop1": "TEXT",
  },
  "sqliteIndex": "",
},
{// Test 13
  "schema": {
    "dataSchema": {
      "prop1": {
        "__tdxType": ["string"],
      },
      "prop2": {
        "__tdxType": ["number"],
      },
    },
    "uniqueIndex": [],
  },
  "sqliteSchema": {
    "prop1": "TEXT",
    "prop2": "NUMERIC",
  },
  "generalSchema": {
    "prop1": "TEXT",
    "prop2": "NUMERIC",
  },
  "sqliteIndex": "",
},
{// Test 14
  "schema": {
    "dataSchema": {
      "prop1": {
        "__tdxType": ["number"],
      },
      "prop2": {
        "__tdxType": ["number"],
      },
    },
    "uniqueIndex": [],
  },
  "sqliteSchema": {
    "prop1": "NUMERIC",
    "prop2": "NUMERIC",
  },
  "generalSchema": {
    "prop1": "NUMERIC",
    "prop2": "NUMERIC",
  },
  "sqliteIndex": "",
},
{// Test 15, (14 in normal counting from 0)
  "name": "Super awesome Test Number 0x0E",
  "description": "The only test schema with a description.",
  "tags": [
    "test",
    "super_cool",
    "written by Alois Klink",
    "Test Numbers should start with 0, not 1.",
  ],
  "schema": {
    "dataSchema": {
      "prop1": {
        "__tdxType": ["number"],
      },
      "prop2": {
        "__tdxType": ["number"],
      },
    },
    "uniqueIndex": [],
  },
  "sqliteSchema": {
    "prop1": "NUMERIC",
    "prop2": "NUMERIC",
  },
  "generalSchema": {
    "prop1": "NUMERIC",
    "prop2": "NUMERIC",
  },
  "sqliteIndex": "",
},
{// Test 16, (15 in normal counting from 0)
  "name": "Upsert Test Schema",
  "tags": [
    "test",
    "upsert_was_terrible_to_write",
    "written by Alois Klink",
    "Test Numbers should start with 0, not 1.",
  ],
  "schema": {
    "dataSchema": {
      "prop1": {
        "__tdxType": ["number"],
      },
      "prop2": {
        "__tdxType": ["number"],
      },
      "prop3": {
        "__tdxType": ["number"],
      },
    },
    "uniqueIndex": [
      {"asc": "prop1"},
    ],
  },
  "sqliteSchema": {
    "prop1": "NUMERIC",
    "prop2": "NUMERIC",
    "prop3": "NUMERIC",
  },
  "generalSchema": {
    "prop1": "NUMERIC",
    "prop2": "NUMERIC",
    "prop3": "NUMERIC",
  },
  "sqliteIndex": "CREATE UNIQUE INDEX dataindex ON data(prop1 ASC)",
},
{// Test 17
  "schema": {
    "dataSchema": {
      "timestamp": {
        "__tdxType": ["number"],
      },
      "arrayData": {
        "__tdxType": ["ndarray"],
      },
    },
    "uniqueIndex": [],
  },
  "sqliteSchema": {
    "timestamp": "NUMERIC",
    "arrayData": "TEXT",
  },
  "generalSchema": {
    "timestamp": "NUMERIC",
    "arrayData": "NDARRAY",
  },
  "sqliteIndex": "",
},
{// Test 18
  "schema": {
    "dataSchema": {
      "arrayData": {
        "__tdxType": ["ndarray"],
      },
    },
    "uniqueIndex": [{"asc": "arrayData"}],
  },
  "sqliteSchema": {
    "arrayData": "TEXT",
  },
  "generalSchema": {
    "arrayData": "NDARRAY",
  },
  "sqliteIndex": "CREATE UNIQUE INDEX dataindex ON data(arrayData ASC)",
},
];

exports.TDX_SCHEMA_LIST_ERROR = [{// Test 1
  "schema": {
    "dataSchema": {
      'p"rop1': {
        "__tdxType": ["string"],
      },
    },
    "uniqueIndex": [],
  },
  "sqliteSchema": {
    'p"rop1': "TEXT",
  },
  "generalSchema": {
    'p"rop1': "TEXT",
  },
  "sqliteIndex": "",
},
{// Test 2
  "schema": {
    "dataSchema": {
      "$prop1": {
        "__tdxType": ["string"],
      },
    },
    "uniqueIndex": [],
  },
  "sqliteSchema": {
    "$prop1": "TEXT",
  },
  "generalSchema": {
    "$prop1": "TEXT",
  },
  "sqliteIndex": "",
},
{// Test 3
  "schema": {
    "dataSchema": {
      "prop1 1": {
        "__tdxType": ["string"],
      },
    },
    "uniqueIndex": [],
  },
  "sqliteSchema": {
    "prop1 1": "TEXT",
  },
  "generalSchema": {
    "prop1 1": "TEXT",
  },
  "sqliteIndex": "",
},
{// Test 4
  "schema": {
    "dataSchema": {
      "prop1+": {
        "__tdxType": ["string"],
      },
    },
    "uniqueIndex": [],
  },
  "sqliteSchema": {
    "prop1+": "TEXT",
  },
  "generalSchema": {
    "prop1+": "TEXT",
  },
  "sqliteIndex": "",
},
];
