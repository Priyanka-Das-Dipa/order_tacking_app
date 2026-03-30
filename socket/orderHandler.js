import {
  calculateTotal,
  createOrderDocument,
  generateOrderId,
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


      callback({success: true, message: "Order cancelled successfully!"});
      
    } catch (error) {}
  });
};
