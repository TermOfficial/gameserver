const cron = require("cron");
const Agenda = require("agenda");

const time = require("time");
const sessionDb = require("./models/session");

class Scheduler {
    constructor() {
        this.agenda = new Agenda({ mongo: global.dbClient.db("scheduler") });
    }

    newJob(def = "No definiton", time, fn) {
        global.logger.info(`Scheduler: New job assigned for ${time}: ${def}`)
        const job = new cron.CronJob(new Date(time), fn);
        return job.start();
    }

    /**
     * Creates a new job and deletes dead session
     * We use this because MongoDB's TTL function only gets called every 60s
     * and our session TTL is 30 seconds
     */
    async sessionJob() {
        this.agenda.define("remove inactive sessions", async (job) => {
            const { deletedCount } = await sessionDb.deleteMany({ updatedAt: { $lt: new Date( ( new Date() ) - 30 * 1000 ) } });
            global.logger.info(`Deleted ${deletedCount} inactive sessions`);
        });
        await this.agenda.start();
        await this.agenda.every("30 seconds", "remove inactive sessions");
    }
}

module.exports = new Scheduler();