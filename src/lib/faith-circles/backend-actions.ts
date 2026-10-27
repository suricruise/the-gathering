'use server';
import{revalidatePath}from'next/cache';import{executeCircleCommand}from'./backend';
// Every call is strictly validated and reauthorized by the service and database transaction.
export async function faithCircleCommand(input:unknown){const result=await executeCircleCommand(input);if(result.data){revalidatePath('/','layout');}return result;}
