import cron from 'node-cron';
import Commission from '../models/Commission.js';

cron.schedule('0 */30 * * * *', async () => {
  console.log('⏰ Running commission expiry cron job');

  try {
    const now = new Date();

    const result = await Commission.updateMany(
      {
        isActive: true,
        status: 'active',
        endDate: { $lte: now }
      },
      {
        $set: {
          status: 'expired',
          isActive: false
        }
      }
    );

    if (result.modifiedCount === 0) {
      console.log('✅ No expired commissions found');
      return;
    }

    console.log(`✔ Expired commissions updated: ${result.modifiedCount}`);
  } catch (error) {
    console.error('❌ Commission expiry cron failed:', error);
  }
});
