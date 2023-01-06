const Joi = require("joi");
const uuid = require("uuid");

const games = require("games");
const cheatDetection = require("cheat-detection");

class Session {
    constructor(version) {
        this.version = version;
        if (!games.isGameAvailable(this.version))
            throw new Error(`${version} is not available for use!`);
        
        this.db = require("./models/session");
        this.schema = Joi.object({
            // profileId: Joi.string().guid().required(),
            userId: Joi.string().required(),
            sessionId: Joi.string().required(),
            lobbyId: Joi.string().guid().required(),
            game: Joi.object({
                id: Joi.string().required(),
                version: Joi.number().required()
            }).required(),
            profile: Joi.object({
                avatar: Joi.number().required(),
                name: Joi.string().required(),
                rank: Joi.number().required(),
                country: Joi.number().required(),
            }).required()
        });

        this.maxLobbyPlayers = global.gs.MAX_LOBBY_PLAYERS;

        // Lobby pipeline
        this.pipeline = [{
                $group: {
                    _id: "$lobbyId",
                    sessions: { $push: "$sessionId" }
                }
            },
            {
                $match: {
                    [`sessions.${this.maxLobbyPlayers-1}`]: {
                        $exists: false
                    }
                }
        }];
    }

    
    /**
     * Sessions
     * 
     * Sessions are handled in database, and pinged constantly by session-client
     * if a player hasn't pinged in certain time, their session gets erased
     * which automatically removes from their lobby too
     */
    async newSession(data) {
        try {
            let sessionId = data.sessionId;

            // Join user to a lobby
            const lobbyId = await this.joinLobby(sessionId);
            data.lobbyId = lobbyId;

            const value = await this.schema.validateAsync(data);
            const entry = new this.db(value);

            return await entry.save();
        }
        catch (err) {
            throw new Error(`Can't create Session: ${err}`);
        };
    }

    async getSession(filter) {
        try {
            return await this.db.findOne(filter);
        }
        catch (err) {
            throw new Error(`Can't get Session with ${JSON.stringify(filter)}: ${err}`);
        }
    }

    async getManySessions(filter) {
        try {
            return await this.db.find(filter);
        }
        catch (err) {
            throw new Error(`Can't get many Sessions with ${JSON.stringify(filter)}: ${err}`);
        }
    }

    async deleteSession(userOrSessionId) {
        try {
            return await this.db.deleteOne({
                $or: [{ userId: userOrSessionId }, { sessionId: userOrSessionId }]
            });
        }
        catch (err) {
            throw new Error(`Can't delete Session with ${JSON.stringify(filter)}: ${err}`);
        }
    }

    async deleteManySessions(filter) {
        try {
            return await this.db.deleteMany(filter);
        }
        catch (err) {
            throw new Error(`Can't delete many Sessions with ${JSON.stringify(filter)}: ${err}`);
        }
    }

    async pingSession(userOrSessionId) {
        try {
            return await this.db.findOneAndUpdate({
                "game.version": this.version,
                $or: [{ userId: userOrSessionId }, { sessionId: userOrSessionId }]
            }, {
                updatedAt: new Date()
            });
        }
        catch (err) {
            throw new Error(`Can't ping Session with ${this.version} - ${userOrSessionId}: ${err}`);
        }
    }

    async randomSession(amount = 1, excludeSid) {
        try {
            return await this.db.aggregate([
                {
                    $match: { 
                        "game.version": this.version,
                        sessionId: { $ne: excludeSid }
                    }
                },
                { 
                    $sample: { size: amount } 
                }
            ])
        }
        catch(err) {
            throw new Error(`Can't get random sessions with amount ${amount}: ${err}`);
        }
    }

    async sessionCount() {
        return await this.db.count({ "game.version": this.version })
    }
    
    /**
     * Lobbies
     * 
     * Lobbies are no longer seperate documents, when a player joins WDF
     * the server groups all players and their lobbyIds and create a lobby like that
     * and then find an empty one for client and append that lobby's id to their session
     * {
     *  sessionId: 22,
     *  lobbyId: 45056
     * }
     * would be grouped like
     * {
     *  _id: 45056,
     *  sessions: [22]
     * }
     * creating lobbies internally only
     */

    async getLobby(lobbyId) {
        const result = await this.db.aggregate([
            {
                $match: { "game.version": this.version }
            },
            {
                $group: {
                    _id: "$lobbyId",
                    sessions: { $push: "$sessionId" }
                }
            },
            {
                $match: { _id: lobbyId }
            }
        ]);
        if (result && result[0]) return result[0];
        else return null;
    }
    
    async getLobbies() {
        const result = await this.db.aggregate([
            {
                $match: { "game.version": this.version }
            },
            {
                $group: {
                    _id: "$lobbyId",
                    sessions: { $push: "$sessionId" }
                }
            }
        ]);
        return result;
    }
    
    async findAvailableLobby() {
        const result = await this.db.aggregate([
            {
                $match: { "game.version": this.version }
            },
            ...this.pipeline,
            // Sort by highest session so that player joins the most crowded lobby
            {   
                $sort: {"sessions":1} 
            }
        ]);
        if (result && result[0]) return result[0];
        else return null;
    }

    async joinLobby(sessionId) {
        let lobbyId;
        let availableLobby = await this.findAvailableLobby();
        
        // If there's an available lobby, set the lobbyId
        // else, we create a new lobby so generate a new ID
        if (availableLobby)
            lobbyId = availableLobby["_id"];
        else lobbyId = uuid.v4();

        return lobbyId;
    }

    /** */

    async exists(userOrSessionId) {
        return await this.db.exists({
            $or: [{ userId: userOrSessionId }, { sessionId: userOrSessionId }]
        }) ? true : false;
    }

    async canUserConnect(userOrProfileId) {
        let isBanned = await cheatDetection.isUserBanned(userOrProfileId);
        return (isBanned);
    }

    async getCountryPlayers(country) {
        return await this.db.count({
            "game.version": this.version,
            "profile.country": country
        }) || 0;
    }

    /** */
}

module.exports = Session;