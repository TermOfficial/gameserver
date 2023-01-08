/**
 * NAS
 */

const express = require("express");
const app = express();

const morganMiddleware = require("morgan-middleware");
const mids = require("http-middleware");
const logger = require("logger");

const b64body = require("./lib/middlewares/b64-body");

global.logger = logger;

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(morganMiddleware);

app.set("trust proxy", "loopback");
app.disable("x-powered-by");
app.disable("etag");

// Prepare all required services for the WebServer
app.post("/ac", b64body, require("./services/ac"));
app.post("/pr", b64body, require("./services/pr"));

app.use(mids.errorHandler);
app.use(mids.notFound);

module.exports = app;