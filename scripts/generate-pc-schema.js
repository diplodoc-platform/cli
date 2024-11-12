const fs = require('fs');
const {generateDefaultSchema} = require('@gravity-ui/page-constructor/schema/index.js');

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

function generatePageConstuctorSchema() {
  const schema = generateDefaultSchema();
  const modifiedSchema = replaceField(schema, 'contentType', 'translate', 'md');

  fs.writeFileSync('schemas/page-constructor-schema.json', JSON.stringify(modifiedSchema, null, 2));
}

module.exports = generatePageConstuctorSchema;
