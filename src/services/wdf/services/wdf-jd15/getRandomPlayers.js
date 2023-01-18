const Session = require("wdf-session");
const uenc = require("uenc");

module.exports = {

    name: `getRandomPlayers`,
    description: ``,
    version: `1.0.0`,

    async init(req, res, next) {

        const { nr_players, player_sid, sid_list } = req.body;

        const session = new Session(2015);
        const sessionId = player_sid;
        
        // if "follow_sid" is given, it means user clicked on sids profile and clicked "join"
        // basically requesting to join specific "lobby"
        if (req.body.follow_sid) {
            return res.sendStatus(504);
        };
        
        let userSession = await session.getSession(sessionId);
        const userCache = await session.getSessionCache(sessionId, req.ip);
        if (!userCache)
            return next({
                status: 401,
                message: "No session!"
            });

        
        // temp
        req.sid = sessionId
        req.uid = userCache.userId
        req.game = userCache.game
        // User doesn't have a session, create one and join to a lobby
        if (!userSession) {
            userSession = await session.newSession({
                userId: req.uid,
                sessionId: req.sid,
                game: {
                    id: req.game.id,
                    version: req.game.version
                },
                profile: userCache,
                ip: req.ip
            });
            global.logger.info(`${req.uid} // ${req.game.version} - ${req.game.id} // ${userSession.profile.name} created session and joined lobby ${userSession.lobbyId}`);
        }

        const lobbyId = userSession.lobbyId;
        const lobbyData = await session.getLobby(lobbyId);
        let lobbySessions = lobbyData.sessions.filter(sid => sid !== sessionId);

        const sessions = await session.getManySessions({
            sessionId: lobbySessions
        });
        const sessionsMap = sessions.map(p => {
            return {
                sid: p.sessionId,
                name: p.profile.name,
                pays: p.profile.country,
                avatar: p.profile.avatar,
                onlinescore: p.profile.rank,
            }
        });

        await session.pingSession(sessionId);
        return res.uenc({
            player_name: userSession.profile.name,

            ...uenc.setIndex(sessionsMap),

            nr_players: sessions.length,
            nr_asked: nr_players,
            
            count: await session.sessionCount()
        });
    }
}