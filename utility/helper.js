// oder validation helper

export function validateOrder(data) {
  if (!data.customerName?.trim()) {
    return {
      valid: false,
      message: "Customer name is required!",
    };
  }
  if (!data.customerPhone?.trim()) {
    return {
      valid: false,
      message: "Customer phone number is required!",
    };
  }
  if (!data.customerAddress?.trim()) {
    return {
      valid: false,
      message: "Customer  is required!",
    };
  }
  if (!Array.isArray(data.items)) {
    return {
      valid: false,
      message: "Order must have at least one item!",
    };
  }
  return { valid: true };
}

// order ID generator
export function generateOrderId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(3, "0");
  return `ORD-${year}${month}${day}-${random}`;
}

// total calculation

export function calculateTotal(items) {
  const subTotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const tax = subTotal * 0.1; 
  const deliveryFee = 35.0;
  const total = subTotal + tax + deliveryFee;

  return {
    subTotal: Math.reduce(subTotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    deliveryFee,
    totalAmount: Math.round(total * 100) / 100,
  };
}

// create order document
export function createOrderDocument(orderData, orderId, totals) {
  return {
    orderId,
    customerName: orderData.customerName.trim(),
    customerPhone: orderData.customerPhone.trim(),
    customerAddress: orderData.customerAddress.trim(),
    items: orderData.items,
    subTotal: totals.subTotal,
    tax: totals.tax,
    deliveryFee: totals.deliveryFee,
    totalAmount: totals.totalAmount,
    specialNotes: orderData.specialNotes || "",
    paymentMethod: orderData.paymentMethod || "Cash on Delivery",
    paymentStatus: "pending",
    status: "pending",
    statusHistory: [
      {
        status: "pending",
        timestamp: new Date(),
        by: "customer",
        note: "Order placed",
      },
    ],
    estimatedTime: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}


// Status Validation

export function isValidStatusTransition(currentStatus, newStatus) {
    const validTransitions = {
        'pending': ['confirmed', 'cancelled'],
        'confirmed': ['preparing', 'cancelled'],
        'preparing': ['ready', 'cancelled'],
        'ready': ['out_for_delivery', 'cancelled'],
        'out_for_delivery': ['delivered'],
        'delivered': [],
        'cancelled': []
    }

    return validTransitions[currentStatus]?.includes(newStatus) || false;
}