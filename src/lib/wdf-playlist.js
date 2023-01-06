const cache = require("cache");
const utils = require("utils");
const games = require("games");
const songs = require("songs");
const time = require("time");
const scheduler = require("scheduler");
const scores = require("wdf-score");

const isThemeAutodance = (id) => id == 0;
const isThemeCommunity = (id) => id == 1;
const isThemeVote = (id) => id == 2;
const isThemeCoach = (id) => id == 3;
const isThemeStarChallenge = (id) => id == 4;

class Playlist {
    constructor(version) {
        this.version = version;
        if (!games.isGameAvailable(this.version))
            throw new Error(`${version} is not available for use!`);
        
        this.communities = global.config.COMMUNITIES;
        this.durations = global.config.DURATIONS;
        this.themes = global.config.THEMES;
        this.keys = {
            prev: `playlist:${this.version}:prev`,
            cur: `playlist:${this.version}:cur`,
            next: `playlist:${this.version}:next`,
        };
    }

    randomTheme(exclude = []) {
        let themes = this.themes.filter(t => !exclude.includes(t.id) && t.isAvailable);
        return utils.random(themes);
    }

    async randomMap(amount = 1, mapsToExclude = [], filter = {}) {
        return await songs.random(this.version, amount, mapsToExclude, filter);
    }

    /**
     * Get current playlist screens
     * @param {Boolean} update If true, returns playlist without any creation/check
     * @returns Playlist data
     */
    async getScreens(update = true) {
        let now = time.milliseconds();
        let playlist = {
            prev: await cache.get(this.keys.prev),
            cur: await cache.get(this.keys.cur),
            next: await cache.get(this.keys.next)
        };
        if (!update) return playlist;

        // If server has slept, this will reset cur and next
        // so that they can be created again
        if (
            (playlist.cur && now > playlist.cur.timing.request_playlist_time) || 
            (playlist.next && now > playlist.next.timing.request_playlist_time)
        ) {
            global.logger.info(`Server was slept, reseting playlist...`)
            playlist.prev = null;
            playlist.cur = null;
            playlist.next = null;
        }
        
        if (!playlist.cur) {
            await cache.set(this.keys.cur, await this.createScreen("cur"));
            playlist.cur = await cache.get(this.keys.cur);
            global.logger.info("CREATED CURRENT " + JSON.stringify(playlist.cur))
        };
    
        if (!playlist.next) {
            await cache.set(this.keys.next, await this.createScreen("next"));
            playlist.next = await cache.get(this.keys.next);
            global.logger.info("CREATED NEXT " + JSON.stringify(playlist.next))
        };
    
        return playlist;
    }

    async rotateScreens() {
        // Rotate playlists
        // prev -> destroyed
        // cur -> prev
        // next -> cur
        // next = new map
        await cache.set(this.keys.prev, await cache.get(this.keys.cur));
        await cache.set(this.keys.cur, await cache.get(this.keys.next));
        await cache.set(this.keys.next, await this.createScreen("next"));
    }

    async createScreen(type) {
        
        let now = time.milliseconds();
        let baseTime = 0;
        let isNext = (type == "next");

        let { prev, cur, next } = await this.getScreens(false);

        // To avoid any repetation, we can pass theme and map pick 
        // to exclude themes/maps from previous screens

        // Ignore current screen's theme only
        // (p - c - n)
        //  1 - 2 - 1 (add cur only)
        //  1 - 2 - 3 (prev and cur) (if there are more than 2 themes available)
        //  3 - 3 - 3 (empty array)
        let ignoredTheme = [cur?.theme.id];

        // Skips all prev cur next maps to avoid any 9 minutes of repetation
        let ignoredSongs = [prev?.map.mapName, cur?.map.mapName, next?.map.mapName];
    
        let theme = this.randomTheme(ignoredTheme);
        if (isThemeCommunity(theme.id)) {
            theme.communities = ["Test1", "Test2"];
        }

        // To filter maps depending on theme type
        let mapFilter = {};

        // Theme 3 is coach pick and map filter should be non-solo maps
        if (isThemeCoach(theme.id)) {
            mapFilter = {
                numCoach: {
                    $gt: 1
                }
            }
        };
        let map = await this.randomMap(1, ignoredSongs, mapFilter);
        map = map[0];
        if (!map) 
            throw new Error(`Playlist couldn't find a map to create screen for, is the song database empty?`);
    
        // Set baseTime depending on theme type
        if (isNext && cur && cur.timing.request_playlist_time && isThemeVote(theme.id)) {
            baseTime = cur.timing.request_playlist_time
        }
        else if (isNext && cur && cur.timing.request_playlist_time) {
            baseTime = cur.timing.request_playlist_time
        }
        else baseTime = now;

        // Make sure that the baseTime is bigger than the current epoch 
        // (can happen if the server sleeps for a while)
        if (baseTime < now)
            baseTime = now;
        
        let screen = {
            theme,
            map
        }
        
        let times = this.calculateTime(baseTime, screen, isNext);
        screen.timing = times.timing;
        screen.timingProgramming = times.timingProgramming;
        
        // Schedule the next rotation
        let rotationTime = screen.timing.stop_song_time - 16000;
        let resetScoreTime = screen.timing.request_playlist_time;

        scheduler.newJob("Rotate playlist", rotationTime, async () => {
            await this.rotateScreens();
        });
        scheduler.newJob("Clear scores after playlist rotation", resetScoreTime, async () => {
            const db = require("./models/wdf-score")
            const { deletedCount } = await db.deleteMany({
                "game.version": this.version
            });
            global.logger.info(`Erased ${deletedCount} scores from ${this.version}`)
        });
        
        return screen;
    }

    calculateTime(baseTime, screen, isNext) {

        let durations = this.durations;
        let themeType = screen.theme.id;
        let mapLength = parseInt(screen.map.length);

        // Pre-song 
        let presentation_start_time = baseTime + this.computePreSongDuration(themeType);
        let start_song_time = presentation_start_time + durations["presentation_duration"];

        // Post-song
        let stop_song_time = start_song_time + mapLength;
        stop_song_time = Number((stop_song_time).toFixed(3));
        
        let recap_start_time = stop_song_time + (durations["waiting_recap_duration"] * 1);
        let session_result_start_time = recap_start_time + this.computeThemeResultDuration(themeType);
        let session_to_world_result_time = session_result_start_time + durations["session_result_duration"];
        let world_result_stop_time = session_to_world_result_time + durations["world_result_duration"];
            
        let merge_computation_time = session_to_world_result_time + durations["world_result_duration"] / 4;
        let merge_computation_duration_in_ms = durations["world_result_duration"] / 2;

        let playlist_computation_time;
        let last_vote_time;
        let pre_compute_time;
        let second_request_playlist_time;

        if (isNext && isThemeVote(themeType)) {
            last_vote_time = world_result_stop_time + durations["vote_choice_duration"];
            playlist_computation_time = last_vote_time + durations["vote_computation_delay"];
            pre_compute_time = world_result_stop_time - durations["playlist_request_delay"] - durations["playlist_computation_delay"];
            second_request_playlist_time = last_vote_time + durations["vote_computation_delay"] + durations["playlist_computation_delay"];

        }
        else {
            if (isNext && isThemeStarChallenge(themeType)) {
                last_vote_time = world_result_stop_time + durations["star_challenge_intro_duration"];
            }
            else {
                // last_vote_time should not be used, but we put a valid time to keep the same chronolo order.
                last_vote_time = world_result_stop_time;
                playlist_computation_time = world_result_stop_time - durations["playlist_request_delay"] - durations["playlist_computation_delay"];
            };
        };

        let request_playlist_time = world_result_stop_time // - durations["playlist_request_delay"];
        
        let unlock_computation_time = stop_song_time + durations["send_stars_delay"];
        let request_unlock_time = unlock_computation_time + durations["unlock_computation_delay"];

        let timing = {
            base_time: baseTime,
            presentation_start_time, 
            start_song_time, 
            stop_song_time, 
            recap_start_time, 
            session_result_start_time, 
            session_to_world_result_time, 
            world_result_stop_time, 
            last_vote_time, 
            request_unlock_time, 
            playlist_computation_time, 
            request_playlist_time,
            merge_computation_time,
            merge_computation_duration_in_ms
        };

        let next_new_step_time = 0;

        if (isNext && isThemeVote(themeType)) next_new_step_time = request_playlist_time;
        else next_new_step_time = world_result_stop_time;
        
        let next_presentation_start_time = next_new_step_time + this.computePreSongDuration(themeType)
        let next_start_song_time = next_presentation_start_time + durations["presentation_duration"]
        let timingProgramming = {
          "request_playlist_time": request_playlist_time, 
          "next_start_song_time": next_start_song_time
        }

        return {
            timing, timingProgramming
        };
    }

    computePreSongDuration(themeType, durations = this.durations) {
        if (isThemeVote(themeType))
            return durations["vote_result_duration"]
        else if (isThemeCommunity(themeType)) {
            return durations["community_choice_duration"]
        }
        else if (isThemeCoach(themeType)) {
            return durations["coach_choice_duration"]
        }
        else if (isThemeStarChallenge(themeType)) {
            return durations["star_challenge_intro_duration"]
        }
        else return 0
    }

    computeThemeResultDuration(themeType, durations = this.durations) {
        if (isThemeAutodance(themeType))
            return durations["autodance_result_duration"]
        else if (isThemeCommunity(themeType)) {
            return durations["community_result_duration"]
        }
        else if (isThemeCoach(themeType)) {
            return durations["coach_result_duration"]
        }
        else if (isThemeStarChallenge(themeType)) {
            return durations["star_challenge_outro_duration"]
        }
        else return 0
    }
}

module.exports = Playlist;