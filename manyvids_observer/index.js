const { Account, Performer, Performers, User, Process, utils, process_store, constants, NightFetch, NightFetchPreset, presets } = loader.SDK;

export default class ManyvidsObserver extends Process {
    /**
         * 
         * @param {Account} account 
         */
    constructor(account) {
        super(account);
        /**
         * @type {Performers | null}
         */
        this.current_category = null;
        /**
         * @type {Performer | null}
         */
        this.current_model = null;
        /**
         * @type {import("./CategoryResponseContentItem.js").default[] | any[]}
         */
        this.current_model_obj = [];
        /**
         * @type {User | null}
         */
        this.current_follower = null;
        /**
         * @type {import("./MemberOptions.js").default[] | any[]}
         */
        this.follower_objs = [];
        this.files_obj = null;
        this.input_log = loader.selected_log('input');
        this.output_log = loader.selected_log('output');
        this.settings = null;
    }

    static manifest = {
        name: "Manyvids Observer",
        description: "An example plugin for NightLoader",
        author: "nascens",
        version: "1.0.0",
        sdk_version: "0.1.0",
        module: "manyvids"
    }

    on_load() {
        console.log('Manyvids Observer loaded!');
    }

    async load() {
        console.log(`Manyvids Observer is loading...`);
    }

    async exec() {
        try {
            return this.#check_new_messages();
        }
        catch (e) {
            console.error(e);
            this.output_log.add({
                event: 'error',
                main_data: e
            });
            return false;
        }
    }

    async #check_new_messages() {
        if (!!this.options && !!this.options.obj) {
            this.settings = this.options.obj;
        }

        if (this.state === 'stopped') {
            return true;
        }

        const observer_enabled = !!this.settings.observer_enabled;
        if (!observer_enabled) return true;

        try {
            /**
             * @type {RoomsResponse}
             */
            const res = await loader.send_message({
                type: 'run_preset',
                body: {
                    access_token_id: this.account.access_token_id,
                    preset: presets.MANYVIDS.GET_ALL_MESSAGES
                }
            });

            if (!res) return;

            let rooms = res.rooms;
            let continuationToken = res.continuationToken;
            while (continuationToken) {
                const base_token = { readFilter:"ALL" };
                base_token.continuationToken = continuationToken;
                const json = JSON.stringify(base_token);
                const base = btoa(json);
                const new_preset = new NightFetchPreset({
                    ...presets.MANYVIDS.GET_ALL_MESSAGES,
                    url: presets.MANYVIDS.GET_ALL_MESSAGES.url.replace(
                        /([?&]token=)[^&]*/,
                        `$1${base}`
                    )
                });
                const next_res = await loader.send_message({
                    type: 'run_preset',
                    body: {
                        access_token_id: this.account.access_token_id,
                        preset: new_preset,
                    }
                });

                if (!next_res) break;
                rooms = rooms.concat(next_res.rooms);
                continuationToken = next_res.continuationToken;
            }
            this.input_log.clear();
            rooms.forEach(c => {
                if (c.senderId === this.account.extra.legacy_id) {
                    return;
                }

                this.input_log.add({
                    event: 'new_msg',
                    main_data: `${c.senderId} : ${c.message}`,
                    extra_data: {
                        sender_id: c.senderId
                    }
                })
            })
        }
        catch (e) {
            console.error(e);
            this.output_log.add({
                event: 'error',
                main_data: e
            })
            return false;
        }


        const delay = this.settings.observer_delay * 1000;
        const delay_checked = isNaN(delay) ? 30000 : delay;

        await utils.sleep(delay_checked);
        return await this.#check_new_messages();
    }
}


/**
 * @typedef {Object} Room
 * @property {string} message - The content of the last message in the room.
 * @property {string} roomKey - Unique identifier for the chat room.
 * @property {string} lastUpdated - ISO 8601 timestamp of the last activity.
 * @property {boolean} readStatus - Whether the message has been read.
 * @property {string} senderId - The ID of the user who sent the last message.
 * @property {string} userRoomStatus - The status of the room for the user (e.g., "ACTIVE").
 * @property {string} roomPartnerDisplayName - Display name of the chat partner.
 * @property {string} roomPartnerAvatarUrl - URL to the partner's profile image.
 * @property {string} roomPartnerId - Unique identifier for the partner.
 * @property {string} roomPartnerType - The account type of the partner (e.g., "model").
 * @property {boolean} roomPartnerDeleted - Indicates if the partner's account is deleted.
 * @property {boolean} roomPartnerPremium - Indicates if the partner has a premium account.
 * @property {boolean} isFollowing - Indicates if the current user follows the partner.
 */

/**
 * @typedef {Object} RoomsResponse
 * @property {Room[]} rooms - Array of chat room objects.
 * @property {number} unreadRooms - Total count of rooms with unread messages.
 * @property {boolean} isPremium - Whether the current user has premium status.
 * @property {string|null} continuationToken - Base64 encoded token for pagination.
 */