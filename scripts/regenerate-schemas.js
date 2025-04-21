#!/usr/bin/env node
/* eslint-disable guard-for-in */

// Replaces some fields in page constructor schema and saves it to schemas folder.
// Add attributes to some fields in page constructor schema and saves it to schemas folder.
// Extend scheme to custom part tree scheme

const {writeFileSync, readFileSync} = require('fs');
const {dirname, join} = require('node:path');
const {dump, load} = require('js-yaml');
const {generateDefaultSchema} = require('@gravity-ui/page-constructor/schema/index.js');

const ROOT = dirname(require.resolve('@diplodoc/cli/package'));

function replaceField(obj, oldFieldName, newFieldName, newFieldValue) {
    if (Array.isArray(obj)) {
      return obj.map(item => replaceField(item, oldFieldName, newFieldName, newFieldValue));
    } else if (obj !== null && typeof obj === "object") {
      const newObj = {};
      for (const key in obj) {
        if (key === oldFieldName) {
          newObj[newFieldName] = newFieldValue;
        } else {
          newObj[key] = replaceField(obj[key], oldFieldName, newFieldName, newFieldValue);
        }
      }
      return newObj;
    }
    return obj;
}
function extendField(obj, fieldNames, extObj) {
  if (Array.isArray(obj)) {
    return obj.map(item => extendField(item, fieldNames, extObj));
  } else if (obj !== null && typeof obj === "object") {
    const newObj = {};
    for (const key in obj) {
      if (fieldNames.includes(key)) {
        newObj[key] = {
          ...extendField(obj[key], fieldNames, extObj),
          ...extObj,
        };
      } else {
        newObj[key] = extendField(obj[key], fieldNames, extObj);
      }
    }
    return newObj;
  }
  return obj;
}
function unionExtScheme(obj, extSchema) {
  if (Array.isArray(obj)) {
    return obj.map((item, index) => unionExtScheme(item, extSchema[index] || {}));
  } else if (obj !== null && typeof obj === "object") {
    const newObj = {...extSchema};
    for (const key in obj) {
      if (newObj[key] && typeof newObj[key] === "object" && !Array.isArray(newObj[key])) {
        newObj[key] = {
          ...newObj[key],
          ...unionExtScheme(obj[key], extSchema[key]),
        };
      } else {
        newObj[key] = unionExtScheme(obj[key], Array.isArray(newObj[key]) ? extSchema[key] : {});
      }
    }
    return newObj;
  }
  return obj;
}

const schema = generateDefaultSchema();
let modifiedSchema = replaceField(schema, 'contentType', 'translate', 'md');
modifiedSchema = extendField(modifiedSchema, ['urlTitle', 'label'], {'translate': 'md'});

const extScheme = load(readFileSync(join(ROOT, 'schemas/page-constructor-schema-extend.yaml'), 'utf8'));
modifiedSchema = unionExtScheme(modifiedSchema, extScheme);

writeFileSync('schemas/page-constructor-schema.yaml', dump(modifiedSchema));
