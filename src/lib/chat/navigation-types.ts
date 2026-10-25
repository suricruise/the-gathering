export type NotificationMode='inherit'|'all'|'mentions'|'muted';
export type ChatWorkspaceState={collapsed:string[];last_channel:string|null;community_mode:NotificationMode;channel_mode:NotificationMode;username:string;can_mass_mention:boolean};
export type SearchHit={id:string;channel_id:string;channel_name:string;parent_id:string|null;author_name:string;created_at:string;created_seq:string;snippet:string};
export type SearchPage={items:SearchHit[]};
