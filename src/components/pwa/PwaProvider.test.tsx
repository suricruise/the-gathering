import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PwaProvider } from "./PwaProvider";
import { InstallApp } from "./InstallApp";
let workerDescriptor: PropertyDescriptor | undefined;
beforeEach(() => {
 workerDescriptor=Object.getOwnPropertyDescriptor(navigator,"serviceWorker");
 vi.stubGlobal("matchMedia",vi.fn(() => ({ matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn() })));
});
afterEach(() => {
 cleanup();
 if(workerDescriptor) Object.defineProperty(navigator,"serviceWorker",workerDescriptor);
 else delete (navigator as unknown as Record<string,unknown>).serviceWorker;
 vi.unstubAllGlobals();vi.unstubAllEnvs();
});
it("shows truthful fallback instructions when a native install prompt is unavailable", () => {
 render(<PwaProvider><InstallApp /></PwaProvider>);
 expect(screen.getByRole("link",{name:"How to install"})).toHaveAttribute("href","#install-steps");
 expect(screen.getByRole("heading",{name:"iPhone & iPad"})).toBeVisible();
 expect(screen.queryByRole("button",{name:"Install The Gathering"})).toBeNull();
});
it("does not claim installation until the browser confirms it", async () => {
 render(<PwaProvider><InstallApp /></PwaProvider>);
 const prompt=vi.fn(async()=>{}),event=new Event("beforeinstallprompt",{cancelable:true});
 Object.assign(event,{prompt,userChoice:Promise.resolve({outcome:"accepted"})});
 act(()=>window.dispatchEvent(event));
 await userEvent.click(screen.getByRole("button",{name:"Install The Gathering"}));
 expect(prompt).toHaveBeenCalledTimes(1);
 expect(screen.getByText(/Installation requested/)).toBeVisible();
 expect(screen.queryByText("You’re using the installed app.")).toBeNull();
 act(()=>window.dispatchEvent(new Event("appinstalled")));
 expect(screen.getByText("You’re using the installed app.")).toBeVisible();
});
it("handles dismissing installation and reports offline status without fake queued messages", async () => {
 render(<PwaProvider><InstallApp /></PwaProvider>);
 const event=new Event("beforeinstallprompt");Object.assign(event,{prompt:async()=>{},userChoice:Promise.resolve({outcome:"dismissed"})});
 act(()=>window.dispatchEvent(event));await userEvent.click(screen.getByRole("button",{name:"Install The Gathering"}));
 expect(screen.getByText(/Installation dismissed/)).toBeVisible();
 act(()=>window.dispatchEvent(new Event("offline")));
 expect(screen.getByText("You’re offline. Messages, uploads and voice need an internet connection.")).toBeVisible();
 act(()=>window.dispatchEvent(new Event("online")));
 expect(screen.queryByText("You’re offline. Messages, uploads and voice need an internet connection.")).toBeNull();
});

it("prepares service-worker updates only on request and offers a manual reload", async () => {
 vi.stubEnv("NODE_ENV","production");vi.stubGlobal("isSecureContext",true);
 const postMessage=vi.fn(),worker=Object.assign(new EventTarget(),{postMessage});
 const registration=Object.assign(new EventTarget(),{waiting:worker,installing:null,update:vi.fn(async()=>{})});
 const serviceWorker=Object.assign(new EventTarget(),{controller:{},register:vi.fn(async()=>registration)});
 Object.defineProperty(navigator,"serviceWorker",{configurable:true,value:serviceWorker});
 render(<PwaProvider><InstallApp /></PwaProvider>);
 const prepare=await screen.findByRole("button",{name:"Prepare update"});
 expect(postMessage).not.toHaveBeenCalled();
 await userEvent.click(prepare);expect(postMessage).toHaveBeenCalledWith({type:"ACTIVATE_UPDATE"});
 act(()=>serviceWorker.dispatchEvent(new Event("controllerchange")));
 expect(screen.getByRole("button",{name:"Reload app"})).toBeVisible();
 expect(screen.getByText(/Leave your voice room before reloading/)).toBeVisible();
 expect(screen.getByRole("heading",{name:/Make room for/})).toBeVisible();
});
