const { Account, Performer, Performers, User, Process, VideoUploader, utils, process_store, constants, NightFetch, presets } = loader.SDK;

export default class ManyvidsSpam extends Process {
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
        this.output_log = loader.selected_log('output');
        this.settings = null;
    }

    /**
     * @type {string[] | any[]}
     */
    get category_ids() {
        return this.settings.categories?.map(num => parseInt(num, 10)).filter(val => !isNaN(val)) || [];
    }

    static manifest = {
        name: "Manyvids Spam",
        description: "An example plugin for NightLoader",
        author: "nascens",
        version: "1.0.0",
        sdk_version: "0.1.0",
        module: "manyvids"
    }

    on_load() {
        console.log('Manyvids Spam loaded!');
    }

    static decode_message(template, user) {
        return template
            // Replace {{username}} and {{clubRank}} style tokens
            .replace(/\{\{(\w+)\}\}/g, (match, key) => {
                const map = {
                    username: user.display_name,
                    clubRank: user.obj?.clubRank,
                };
                return key in map ? (map[key] ?? match) : match;
            })
            // Replace {{[variant1|variant2|variant3]}} with a random pick
            .replace(/\{\{\[([^\]]+)\]\}\}/g, (match, variants) => {
                const options = variants.split('|');
                return options[Math.floor(Math.random() * options.length)];
            });
    }

    async load() {
        console.log(`Manyvids Spam is loading...`);
        const most_searched_tags = await loader.send_message({
            type: 'run_preset',
            body: {
                preset: presets.MANYVIDS.GET_TAG_SUGGESTION
            }
        });
        const result = most_searched_tags.trends;
        const p = document.createElement('p');
        p.innerHTML = `<b>Most searched tags</b>: ${result.join(', ')}`;
        const audience_source_head = document.getElementById('mv_audience_source_head');
        audience_source_head.appendChild(p);

        const message_test_btn = document.getElementById('message_test_btn');
        const message_input = document.getElementById('message_input');
        const message_test_output = document.getElementById('message_test');
        if (message_test_btn && message_input && message_test_output) {
            message_test_btn.onclick = (e) => {
                message_test_output.value = ManyvidsSpam.decode_message(message_input.value, { display_name: 'TestUser', obj: { clubRank: 777 }})
            }
        }
    }

    async exec() {
        if (!!this.options && !!this.options.obj) {
            this.settings = this.options.obj;
        }

        if (this.state === 'stopped') {
            return true;
        }

        try {
            const current_follower_obj = this.follower_objs.shift();
            if (!current_follower_obj) {
                // current model process
                if (this.current_model && !this.current_model.is_finished) {
                    const current_res = await this.#process_model(this.current_model);
                    if (current_res.success) {
                        return this.exec();
                    }
                }
                const opts_model_obj = this.current_model_obj || this.settings.model_list?.split(',').map(id => id.trim()) || [];
                const current_model_obj = opts_model_obj.shift();

                if (!current_model_obj) {
                    // current category process
                    if (this.current_category && !this.current_category.is_finished) {
                        const current_res = await this.#process_category(this.current_category);
                        if (current_res.success) {
                            return this.exec();
                        }
                    }

                    const current_category_id = this.category_ids.shift();
                    // no caterogies left
                    if (!current_category_id) {
                        return true;
                    }
                    // new category process
                    const new_category = new Performers(current_category_id, this);
                    await this.#process_category(new_category);
                    return this.exec();
                }

                // new model process
                const new_model = new Performer(current_model_obj, this);
                await this.#process_model(new_model);
                return this.exec();
            }

            //member process
            const new_member = new User(current_follower_obj, this);
            await this.#process_follower(new_member);
            return this.exec();
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

    /**
     * 
     * @param {Performers} category 
     */
    async #process_category(category) {
        const conditions = !!category && !category.is_finished;
        if (!conditions) {
            this.current_category = null;
            return { success: false, error: "Category is invalid or finished" }
        }
        const result = await category.get_next_page();
        if (result.error) {
            this.current_category = null;
            return { success: false, error: result.error }
        }
        this.current_category = category;
        this.current_model_obj = result;
        this.output_log.add({
            event: 'p_category',
            main_data: category.query
        });
        return { success: true };
    }

    /**
     * 
     * @param {Performer} model 
     */
    async #process_model(model) {
        if (!model.initialized) {
            await model.init();
        }
        if (!model) {
            this.current_model = null;
        }

        const conditions = model.is_valid && !model.is_finished;
        if (!conditions) {
            this.current_model = null;
        }

        const result = await model.followers();
        if (result.error) throw result.error;

        this.current_model = model;
        this.follower_objs = result;
        this.output_log.add({
            event: 'p_model',
            main_data: model.handle
        });
        return { success: true };
    }

    /**
     * 
     * @param {User} user 
     */
    async #process_follower(user) {
        const init = await user.init();
        if (!init) throw 'Failed to initialize user';

        const bot_username_conditions = !!this.settings.skip_bot_usernames && is_bot_username(user.handle);
        if (bot_username_conditions) {
            this.output_log.add({
                event: 's_bot_username',
                main_data: user.handle
            });
            return;
        }

        if (!!this.settings.empty_chat && !user.empty_messages) {
            this.output_log.add({
                event: 's_follower_empty_chat',
                main_data: user.handle
            });
            return;
        }

        if (this.settings.files?.length && !this.files_obj) {
            this.files_obj = await loader.SDK.upload_files(this.settings.files);
            this.output_log.add({
                event: 'files_uploaded',
                main_data: this.files_obj.attachedImages.length + this.files_obj.attachedVideos.length
            })
        }

        const min_rating = parseInt(this.settings.min_rating, 10);
        const rating_conditions = !isNaN(min_rating) && min_rating > 0 && !!user.rating && user.rating > 0 && min_rating > user.rating;
        if (rating_conditions) {
            this.output_log.add({
                event: 's_follower_rating',
                main_data: user.handle
            });
            return;
        }

        if (!!this.settings.auto_follow) {
            const is_followed = await user.is_followed();
            if (!is_followed) {
                await user.follow();
                this.output_log.add({
                    event: 'p_follower_followed',
                    main_data: user.handle
                });
            }
        }

        const premium_conditions = !!this.settings.premium_members_only && !user.obj.hasPremiumMembership;
        if (premium_conditions) {
            this.output_log.add({
                event: 's_not_premium',
                main_data: user.handle
            });
            return;
        }

        const club_rank_conditions = !!this.settings.min_club_rank && (!!user.obj.clubRank || user.obj.clubRank > this.settings.min_club_rank);
        if (club_rank_conditions) {
            this.output_log.add({
                event: 's_club_rank',
                main_data: user.handle
            })
            return;
        }

        const ms_in_day = 24 * 60 * 60 * 1000;
        const acc_age_in_days = (new Date().getTime() - new Date(user.obj.createdAt).getTime()) / ms_in_day;
        const min_account_age_conditions = !!this.settings.min_account_age && acc_age_in_days < this.settings.min_account_age;
        if (min_account_age_conditions) {
            this.output_log.add({
                event: 's_min_acc_age',
                main_data: user.handle
            });
            return;
        }

        const max_account_age_conditions = !!this.settings.max_account_age && acc_age_in_days > this.settings.max_account_age;
        if (max_account_age_conditions) {
            this.output_log.add({
                event: 's_max_acc_age',
                main_data: user.handle
            })
            return;
        }

        const decoded_message = ManyvidsSpam.decode_message(this.settings.message, user);
        if (!decoded_message) throw 'Empty message';

        const result = await user.send_message({
            message: decoded_message,
            price: !!this.settings.price ? parseInt(this.settings.price, 10) : 0,
            files: this.settings.file
        })
            .catch(console.error);

        // const result = 1;

        if (!result) return;
        if (result.message) {
            throw result.message;
        }

        await new NightFetch(presets.SENT_MESSAGE, {
            recipient: user.id,
            service: 'manyvids',
            text: this.settings.message
        }).exec();

        this.output_log.add({
            event: 'p_follower',
            main_data: user.handle
        });

        const delay = this.settings.post_delay || 0;
        const extra_delay = this.settings.extra_random_delay ? random(this.settings.extra_random_delay) : 0;
        const final_delay = delay+extra_delay;
        await utils.sleep(final_delay * 1000);
    }
}

function is_bot_username(string) {
    const split = string.split('_');
    return string.length === 17 && split.length === 2 && split[0].length === 8;
}

function random(max=0) {
    if (!max) return 0;
    return parseInt(Math.random() * max, 10);
}