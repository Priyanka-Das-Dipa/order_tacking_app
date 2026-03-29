import { validateOrder } from "../utility/helper.js";

export const orderHandler = (io, socket) => {
  console.log("a user connected", socket.id);

  // order place
  socket.on("placeOrder", async (data, callback) => {
    try {
        console.log(`Order placed from ${socket.id}`);
        const validation = validateOrder(data);
        if(!validation.valid){
            return callback({ success: false, message: validation.message });
        }
        
    } catch (error) {
        console.log(error);
    }
  });
};
