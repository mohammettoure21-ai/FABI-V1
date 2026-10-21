import {transaction} from './db.mjs';
import {queueArrivalReminders} from './reservation-reminders.mjs';
import {scheduleActivityEmails} from './activity';
export async function syncArrivalReminders(){
 const result=await transaction(queueArrivalReminders);
 scheduleActivityEmails();
 return result;
}
