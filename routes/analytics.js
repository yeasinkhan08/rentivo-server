// last N months as "YYYY-MM" labels (oldest first)
const lastMonths = (count) => {
  const months = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    months.push(date.toISOString().slice(0, 7));
  }
  return months;
};

module.exports = (app, collections, middleware) => {
  const {
    usersCollection,
    equipmentCollection,
    bookingsCollection,
    paymentsCollection,
  } = collections;
  const { verifyToken, verifyOwner, verifyAdmin } = middleware;

  // admin: platform-wide analytics
  app.get("/analytics/admin", verifyToken, verifyAdmin, async (req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);

      const [
        totalUsers,
        totalEquipment,
        pendingApprovals,
        totalBookings,
        completedRentals,
        revenueResult,
        monthlyResult,
      ] = await Promise.all([
        usersCollection.countDocuments(),
        equipmentCollection.countDocuments(),
        equipmentCollection.countDocuments({ status: "pending" }),
        bookingsCollection.countDocuments(),
        bookingsCollection.countDocuments({
          bookingStatus: "confirmed",
          endDate: { $lt: today },
        }),
        paymentsCollection
          .aggregate([
            { $match: { status: "paid" } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ])
          .toArray(),
        bookingsCollection
          .aggregate([
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                bookings: { $sum: 1 },
                revenue: { $sum: "$totalAmount" },
              },
            },
          ])
          .toArray(),
      ]);

      const monthly = lastMonths(6).map((month) => {
        const found = monthlyResult.find((item) => item._id === month);
        return {
          month,
          bookings: found ? found.bookings : 0,
          revenue: found ? found.revenue : 0,
        };
      });

      res.send({
        totalUsers,
        totalEquipment,
        pendingApprovals,
        totalBookings,
        completedRentals,
        totalRevenue: revenueResult.length ? revenueResult[0].total : 0,
        monthly,
      });
    } catch (error) {
      console.error("Admin analytics error:", error.message);
      res.status(500).send({ message: "Could not load analytics" });
    }
  });

  // owner: analytics for the owner's own rental business
  app.get("/analytics/owner", verifyToken, verifyOwner, async (req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const ownerEmail = req.decoded.email;

      const [
        totalEquipment,
        totalBookings,
        completedRentals,
        earningsResult,
        monthlyResult,
      ] = await Promise.all([
        equipmentCollection.countDocuments({ ownerEmail }),
        bookingsCollection.countDocuments({ ownerEmail }),
        bookingsCollection.countDocuments({
          ownerEmail,
          bookingStatus: "confirmed",
          endDate: { $lt: today },
        }),
        paymentsCollection
          .aggregate([
            { $match: { ownerEmail, status: "paid" } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ])
          .toArray(),
        paymentsCollection
          .aggregate([
            { $match: { ownerEmail, status: "paid" } },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m", date: "$paidAt" } },
                earnings: { $sum: "$amount" },
              },
            },
          ])
          .toArray(),
      ]);

      const monthly = lastMonths(6).map((month) => {
        const found = monthlyResult.find((item) => item._id === month);
        return { month, earnings: found ? found.earnings : 0 };
      });

      res.send({
        totalEquipment,
        totalBookings,
        completedRentals,
        totalEarnings: earningsResult.length ? earningsResult[0].total : 0,
        monthly,
      });
    } catch (error) {
      console.error("Owner analytics error:", error.message);
      res.status(500).send({ message: "Could not load analytics" });
    }
  });
};
