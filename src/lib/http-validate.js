const Joi = require("joi");

const accessVariableNestedProp = (obj, props) => {
    let current = obj
  for(const prop of props){
      current = current[prop];
    if(!current) return null;
  }
  return current;
}

module.exports = async (req, res, next) => {
    let schemas = global.httpSchema || {};
    if (!schemas) return next();

    let path = req.path;
    let schema = accessVariableNestedProp(schemas, path.slice(1).split("/"));
    if (!schema) return next();

    let keys = ["body", "query"];
    keys.forEach(k => {
        let keySchema = schema[k];
        if (keySchema) {
            keySchema = Joi.object().keys(keySchema).unknown(true);
            let { value, error } = keySchema.validate(req[k]);
            if (error)
                return next({
                    status: 400,
                    message: `Invalid request`,
                    error: error.message
                });
            
            req[k] = value;
        }
    })
    
    return next();
};