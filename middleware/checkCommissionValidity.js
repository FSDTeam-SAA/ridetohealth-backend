import cron from 'node-cron';
import Commission from '../models/Commission.js';
import Ride from '../models/Ride.js';

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


cron.schedule('0 */1 * * * *', async () => {
  console.log('⏰ Running ride completion cron job');

  try {
    const now = new Date();

    const rides = await Ride.find({
      status: { $in: ['requested', 'accepted'] },
      endTime: { $lte: now }
    }).select('driverId');

    if (rides.length === 0) {
      console.log('✅ No rides to complete');
      return;
    }

    const driverIds = [
      ...new Set(
        rides
          .map(r => r.driverId)
          .filter(Boolean)
          .map(id => id.toString())
      )
    ];

    await Ride.updateMany(
      {
        status: { $in: ['requested', 'accepted'] },
        endTime: { $lte: now }
      },
      {
        $set: { status: 'completed' }
      }
    );

    if (driverIds.length > 0) {
      await Driver.updateMany(
        { _id: { $in: driverIds } },
        { $set: { available: true } }
      );
    }

    console.log(
      `✔ Rides completed: ${rides.length}, Drivers released: ${driverIds.length}`
    );
  } catch (error) {
    console.error('❌ Ride completion cron failed:', error);
  }
});
