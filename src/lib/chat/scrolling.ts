export function nearEnd(element: Pick<HTMLElement,"scrollHeight"|"scrollTop"|"clientHeight">, distance=100) { return element.scrollHeight-element.scrollTop-element.clientHeight<=distance; }
export function visibleAnchor(list: HTMLElement) {
  const top=list.getBoundingClientRect().top;
  const element=Array.from(list.querySelectorAll<HTMLElement>("[data-message-id]")).find(row=>row.getBoundingClientRect().bottom>top);
  return element?{id:element.id,offset:element.getBoundingClientRect().top-top}:null;
}
export function restoreAnchor(list: HTMLElement,anchor:{id:string;offset:number}|null) { const row=anchor&&document.getElementById(anchor.id);if(row&&anchor)list.scrollTop+=row.getBoundingClientRect().top-list.getBoundingClientRect().top-anchor.offset; }
