import {describe,it,expect} from "vitest";
import {channelManagementSchema} from "./channel-management";
const id="11111111-1111-4111-8111-111111111111";
const settings={id,name:"general",description:"Welcome",kind:"text",category_id:"",position:0,is_private:false,attachment_policy:"posters",notification_default:"inherit",reason:"Improve organization"};
describe("channel management validation",()=>{
 it("validates channel settings and rejects client roles or actor identity",()=>{
  expect(channelManagementSchema.safeParse({operation:"save",data:settings}).success).toBe(true);
  for(const extra of[{actor_id:id},{role:"owner"},{position:-1},{attachment_policy:"public"},{notification_default:"spam"},{kind:"video"},{name:"<script>"}])expect(channelManagementSchema.safeParse({operation:"save",data:{...settings,...extra}}).success).toBe(false);
 });
 it("requires explicit confirmation and a moderation reason for destructive actions",()=>{
  expect(channelManagementSchema.safeParse({operation:"delete",data:{id,confirmation:"general",reason:"Empty channel cleanup"}}).success).toBe(true);
  for(const data of[{id,confirmation:"general"},{id,confirmation:"",reason:"Cleanup"}])expect(channelManagementSchema.safeParse({operation:"delete",data}).success).toBe(false);
 });
 it("bounds scoped restrictions and rejects privilege modifications",()=>{
  for(const minutes of[1,10080])expect(channelManagementSchema.safeParse({operation:"restrict",data:{user_id:id,minutes,reason:"Repeated spam"}}).success).toBe(true);
  for(const minutes of[0,10081,1.5])expect(channelManagementSchema.safeParse({operation:"restrict",data:{user_id:id,minutes,reason:"Repeated spam"}}).success).toBe(false);
  expect(channelManagementSchema.safeParse({operation:"platform_role",data:{user_id:id,role:"owner"}}).success).toBe(false);
 });
});
