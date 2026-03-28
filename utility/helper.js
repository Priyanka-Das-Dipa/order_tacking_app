export function validateOrder(data) {
    if(!data.customerName?.trim()){
        return{
            valid: false, message: 'Customer name is required!'
        }
    }
    if(!data.customerPhone?.trim()){
        return{
            valid: false, message: 'Customer phone number is required!'
        }
    }
    if(!data.customerAddress?.trim()){
        return{
            valid: false, message: 'Customer  is required!'
        }
    }
    if(!Array.isArray(data.items)){
        return{
            valid: false, message: 'Order must have at least one item!'
        }
    }
    return { valid: true };
}