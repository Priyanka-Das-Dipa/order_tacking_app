import {
  calculateTotal,
  createOrderDocument,
  generateOrderId,
  isValidStatusTransition,
  validateOrder,
} from "../utility/helper.js";

export const orderHandler = (io, socket) => {
  console.log("a user connected", socket.id);

  // order place
  socket.on("placeOrder", async (data, callback) => {
    try {
      console.log(`Order placed from ${socket.id}`);
      const validation = validateOrder(data);
      if (!validation.valid) {
        return callback({ success: false, message: validation.message });
      }

      // calculate total, orderID and order Document
      const total = calculateTotal(data.items);
      const orderId = generateOrderId();
      const order = createOrderDocument(data, orderId, total);

      const orderCollection = getCollection("orders");
      await orderCollection.insertOne(order);

      socket.join(`order-${orderId}`);
      socket.join("customers");

      (io.to("admins").emit("newOrder", { order }),
        callback({ success: true, order }));
      console.log(`order created: ${orderId}`);
    } catch (error) {
      console.log(error);
      callback({
        success: false,
        message: "Failed to place order. Try again!!",
      });
    }
  });

  // order track
  socket.on("trackOrder", async (data, callback) => {
    try {
      const orderCollection = getCollection("orders");
      const order = await orderCollection?.findOne({ orderId: data?.orderId });

      if (!order) {
        return callback({
          success: false,
          message: "Order not found!",
        });
      }

      socket.join(`order-${data?.orderId}`);
      callback({
        success: true,
        order,
      });
    } catch (error) {
      console.error("Order Tracking Error:", error);
      callback({
        success: false,
        message: error?.message || "Failed to track order. Try again!!",
      });
    }
  });

  // order cancel
  socket.on("cancelOrder", async (data, callback) => {
    try {
      const ordersCollection = getCollection("orders");
      const order = await ordersCollection.findOne({ orderId: data?.orderId });
      if (!order) {
        return callback({
          success: false,
          message: "Order not found!",
        });
      }

      if (!["pending", "confirmed"].includes(order?.status)) {
        return callback({
          success: false,
          message: "Order cannot be cancelled at this stage!",
        });
      }

      // update order status to cancelled
      await ordersCollection.updateOne(
        { orderId: data?.orderId },
        {
          $set: { status: "cancelled", updateAt: new Date() },
          $push: {
            statusHistory: {
              status: "cancelled",
              timestamp: new Date(),
              by: socket.id,
              note: data.reason || "Cancelled by customer",
            },
          },
        },
      );

      io.to(`order-${data?.orderId}`).emit("orderCancelled", {
        orderId: data.orderId,
      });
      io.to("admins").emit("orderCancelled", {
        orderId: data.orderId,
        customerName: order.customerName,
      });

      callback({ success: true, message: "Order cancelled successfully!" });
    } catch (error) {
      console.error("Order Cancel Error:", error);
      callback({
        success: false,
        message: error?.message || "Failed to cancel order. Try again!!",
      });
    }
  });

  // get my orders
  socket.on("getMyOrders", async (data, callback) => {
    try {
      const ordersCollection = getCollection("orders");
      const orders = await ordersCollection
        .find({
          customerPhone: data?.customerPhone,
        })
        .sort({ createdAt: -1 })
        ?.limit(20)
        ?.toArray();
      callback({ success: true, orders });
    } catch (error) {
      console.error("Get Orders Error:", error);
      callback({
        success: false,
        message: error?.message || "Failed to get orders. Try again!!",
      });
    }
  });

  // Admin events

  // admin login
  socket.on("adminLogin", async (data, callback) => {
    try {
      if (data.password === process.env.ADMIN_PASSWORD) {
        socket.isAdmin = true;
        socket.join("admins");
        console.log(`Admin logged in: ${socket.id}`);
        callback({ success: true, message: "Admin login successful!" });
      } else {
        callback({
          success: false,
          message: "Invalid password. Admin login failed!",
        });
      }
    } catch (error) {
      callback({
        success: false,
        message: error?.message || "Admin login failed. Try again!!",
      });
    }
  });

  // get all orders
  socket.on("getAllOrders", async (data, callback) => {
    try {
      if (!socket.isAdmin) {
        return callback({ success: false, message: "Unauthorized access!" });
      }

      const ordersCollection = getCollection("orders");
      const filter = data?.status ? { status: data?.status } : {};
      const orders = await ordersCollection
        .find(filter)
        .sort({ createdAt: -1 })
        ?.limit(20)
        ?.toArray();
      callback({ success: true, orders });
    } catch (error) {
      callback({ success: false, message: "Failed to load data!" });
    }
  });

  // update order status
  socket.on("updateOrderStatus", async (data, callback) => {
    try {
      const ordersCollection = getCollection("orders");
      const order = await ordersCollection.findOne({ orderId: data?.orderId });

      if (!order) {
        return callback({ success: false, message: "Order not found!" });
      }

      if (!isValidStatusTransition(order?.status, data?.newStatus)) {
        return callback({
          success: false,
          message: "Invalid status transition!",
        });
      }

      // update order status
      const result = await orderCollection.findOneAndUpdate(
        { orderId: data?.orderId },
        {
          $set: { status: data?.newStatus, updateAt: new Date() },
          $push: {
            statusHistory: {
              status: data?.newStatus,
              timestamp: new Date(),
              by: socket.id,
              note: data.note || `Status changed to ${data?.newStatus}`,
            },
          },
        },
        { returnDocument: "after" },
      );

      io.to(`order-${data?.orderId}`).emit("orderStatusUpdated", {
        orderId: data?.orderId,
        newStatus: data?.newStatus,
        order: result,
      });

      socket.to("admin").emit("orderStatusUpdated", {
        orderId: data?.orderId,
        newStatus: data?.newStatus,
      });

      callback({
        success: true,
        order: result,
        message: "Order status updated successfully!",
      });
    } catch (error) {
      callback({ success: false, message: "Failed to update order status!" });
    }
  });

  // accept order
  socket.on("acceptOrder", async (data, callback) => {
    try {
      if (!socket.isAdmin) {
        return callback({ success: false, message: "Unauthorized access!" });
      }

      const orderCollection = getCollection("orders");
      const order = await orderCollection.findOne({ orderId: data?.orderId });

      if (!order || order?.status !== "pending") {
        return callback({
          success: false,
          message: "Order not found or cannot be accepted!",
        });
      }

      const estimatedTime = data?.estimatedTime || 30; // default 30 mins

      const result = await orderCollection.findOneAndUpdate(
        {
          orderId: data?.orderId,
        },
        {
          $set: { status: "confirmed", estimatedTime, updateAt: new Date() },
          $push: {
            statusHistory: {
              status: "confirmed",
              timestamp: new Date(),
              by: socket.id,
              note: `Order accepted with estimated time ${estimatedTime} mins`,
            },
          },
        },
        { returnDocument: "after" },
      );
      io.to(`order-${data?.orderId}`).emit("orderAccepted", {
        orderId: data?.orderId,
        estimatedTime,
      });

      socket
        .to("admin")
        .emit("orderAcceptedByAdmin", { orderId: data?.orderId });
      callback({
        success: true,
        order: result,
        message: "Order accepted successfully!",
      });
    } catch (error) {
      callback({
        success: false,
        message: error?.message || "Failed to accept order!",
      });
    }
  });

  // reject order
  socket.on("rejectedOrder", async (data, callback) => {
    try {
      if (!socket.isAdmin) {
        return callback({ success: false, message: "Unauthorized access!" });
      }

      const orderCollection = getCollection("orders");
      const order = await orderCollection.findOne({ orderId: data?.orderId });

      if (!order || order?.status !== "pending") {
        return callback({
          success: false,
          message: "Order cannot be cancelled!",
        });
      }

      const result = await orderCollection.findOneAndUpdate(
        {
          orderId: data?.orderId,
        },
        {
          $set: { status: "cancelled", updateAt: new Date() },
          $push: {
            statusHistory: {
              status: "cancelled",
              timestamp: new Date(),
              by: socket.id,
              note: `Order cancelled !`,
            },
          },
        },
        { returnDocument: "after" },
      );
      io.to(`order-${data?.orderId}`).emit("orderRejected", {
        orderId: data?.orderId,
        reason: data?.reason || "Order rejected by admin",
      });

      socket.to("admin").emit("orderRejectedByAdmin", {
        reason: data?.reason || "Order rejected by admin",
      });
      callback({
        success: true,
      });
    } catch (error) {
      callback({
        success: false,
        message: error?.message || "Failed to reject order!",
      });
    }
  });

  // Live Status of orders

  socket.on("getLiveStatus", async (data, callback) => {
    try {
      if (!socket?.isAdmin) {
        return callback({ success: false, message: "Unauthorized access!" });
      }

      const orderCollection = getCollection("orders");
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const stats = {
        totalToday: await orderCollection.countDocuments({
          createdAt: { $gte: today },
        }),
        pending: await orderCollection.countDocuments({ status: "pending" }),
        confirmed: await orderCollection.countDocuments({
          status: "confirmed",
        }),
        preparing: await orderCollection.countDocuments({
          status: "preparing",
        }),
        ready: await orderCollection.countDocuments({ status: "ready" }),
        outForDelivery: await orderCollection.countDocuments({
          status: "out_for_delivery",
        }),
        delivered: await orderCollection.countDocuments({
          status: "delivered",
        }),
        cancelled: await orderCollection.countDocuments({
          status: "cancelled",
        }),
      };

      callback({ success: true, stats });
    } catch (error) {
      callback({
        success: false,
        message: error?.message || "Failed to get live status!",        
      });
    }
  });
};
