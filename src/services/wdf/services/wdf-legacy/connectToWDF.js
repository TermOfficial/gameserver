const utils = require("wdf-utils");

const Session = require("wdf-session");

module.exports = {

    name: `connectToWDF`,
    description: ``,
    version: `1.0.0`,

    async init(req, res, next) {

        const { avatar, name, onlinescore, pays } = req.body;
        const session = new Session(req.game.version);

        // Check if user is allowed to connect to WDF
        const canConnect = await session.canUserConnect(req.uid);
        if (!canConnect) return next({
            status: 401,
            message: `User is not allowed to create connection to WDF!`
        });

        // Amount of players in client's country
        const playersInCountry = await session.getCountryPlayers(pays);
        const sessionExists = await session.exists(req.sid);

        // If client already has a session, delete it
        if (sessionExists) {
            await session.deleteSession(req.sid);
        };

        // New session
        const sessionData = await session.newSession({
            userId: req.uid,
            sessionId: req.sid,
            game: {
                id: req.game.id,
                version: req.game.version
            },
            profile: { 
                avatar, 
                name, 
                rank: onlinescore, 
                country: pays 
            }
        });

        global.logger.info(`${req.game.id} // ${name} joined WDF to lobby ${sessionData.lobbyId}`);

        return res.uenc({
            sid: req.sid,
            players_in_country: playersInCountry,
            t: utils.serverTime()
        });
    }
}