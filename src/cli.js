const yargs = require("yargs/yargs")
const { hideBin } = require("yargs/helpers")

module.exports = () => {
    return yargs(hideBin(process.argv))
    .command('serve <service>', 'Initalize a service', (yargs) => {
        return yargs
          .positional('service', {
            describe: 'Service name',
            demandOption: true
          })
      }, (argv) => {
        return argv
    })
    .option("env", {
        type: "string",
        description: `Service enviroment`
    })
    .option("port", {
        type: "number",
        description: "Port to bind on"
    })
    .option("no-scheduler", {
        type: "boolean",
        alias: "ns",
        description: "Don't schedule any session / score removal"
    })
    .option("test-game", {
        type: "boolean",
        alias: "tg",
        description: "Only have the test game in games list"
    })
    .option("no-bots", {
        type: "boolean",
        alias: "nb",
        description: "Don't create any bots"
    })
    .demandCommand()
    .showHelpOnFail()
    .parse()
}