const utils = require("utils")

module.exports = {

    name: `getServerTime`,
    description: ``,
    version: `1.0.0`,

    async init(req, res, next) {
        return res.uenc({
            t: utils.getServerTime(),
            sendscore_interval: global.config.timings.sendscore_interval / 1000
        })
    }
}