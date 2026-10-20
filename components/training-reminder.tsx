import {enqueueTrainingReminders} from '@/lib/notifications';
export async function TrainingReminder(){
  const {count}=await enqueueTrainingReminders();
  return count>0?<div className="alert danger" role="status">มี {count} รายการที่ยังไม่กรอกผลการนำไปใช้ และใกล้ครบหรือเกินกำหนด 3 วัน <a href="/admin/notices">ดูการแจ้งเตือน →</a></div>:null;
}
