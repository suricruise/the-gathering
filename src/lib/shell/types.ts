import type {WorkspaceNavigation} from '../chat/workspace';
export type RailCommunity={id:string;name:string;slug:string;image:string|null;unread:boolean|null};
export type ShellData={communities:RailCommunity[];hasMore:boolean;selected:string|null;context:{community:RailCommunity;navigation:WorkspaceNavigation|null}|null};
