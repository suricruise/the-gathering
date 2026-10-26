import {expect,it,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
vi.mock('next/link',()=>({default:({href,children,...props}:{href:string;children:React.ReactNode})=><a href={href} {...props}>{children}</a>}));
vi.mock('../voice/VoiceControls',()=>({PersistentVoiceBar:()=>null}));
import {ProfileConnections,MiniProfileCard} from './ProfilePresentation';
it('renders only the authorized projection with mutual labels and actual routes',()=>{render(<ProfileConnections details={{interests:['music','faith'],communities:[{id:'visible',slug:'shared-stories',name:'Shared Stories',mutual:true}]}}/>);expect(screen.getByText('Music')).toBeInTheDocument();expect(screen.getByText('Faith & Life')).toBeInTheDocument();expect(screen.getByRole('link',{name:'Shared Stories'})).toHaveAttribute('href','/communities/shared-stories');expect(screen.getByText('Mutual community')).toBeInTheDocument();});
it('shows unavailable metadata without inventing profile details',()=>{render(<ProfileConnections error="Private profile"/>);expect(screen.getByRole('status')).toHaveTextContent('Private profile');expect(screen.queryByRole('heading',{name:'Interests'})).not.toBeInTheDocument();});
it('keeps the mini profile on the persistent member route',()=>{render(<MiniProfileCard id="member-id" name="Real Member" username="real_member" avatar/>);expect(screen.getByRole('link')).toHaveAttribute('href','/members/member-id');expect(screen.getByRole('link')).toHaveTextContent('Real Member');expect(document.querySelector('img')).toHaveAttribute('src','/api/avatars/member-id');});
