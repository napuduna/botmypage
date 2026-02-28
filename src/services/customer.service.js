const Customer = require('../models/customer.model');
const logger = require('../utils/logger');

/**
 * Customer Service
 * บันทึกและอัปเดตข้อมูลลูกค้า
 */

/**
 * ค้นหาลูกค้าจาก Facebook ID
 */
const getCustomerByFacebookId = async (facebookId) => {
  try {
    const customer = await Customer.findOne({ facebookId });
    return customer;
  } catch (error) {
    logger.error(`Error finding customer ${facebookId}:`, error);
    throw error;
  }
};

/**
 * สร้างลูกค้าใหม่
 */
const createCustomer = async (facebookId, data = {}) => {
  try {
    const customer = new Customer({
      facebookId,
      ...data,
    });

    await customer.save();
    logger.info(`✅ Customer created: ${facebookId}`);
    return customer;
  } catch (error) {
    logger.error(`Error creating customer:`, error);
    throw error;
  }
};

/**
 * อัปเดตข้อมูลลูกค้า
 */
const updateCustomer = async (facebookId, data) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      { facebookId },
      { $set: data },
      { new: true, upsert: true } // สร้างใหม่ถ้าไม่มี
    );

    logger.info(`✅ Customer updated: ${facebookId}`);
    return customer;
  } catch (error) {
    logger.error(`Error updating customer:`, error);
    throw error;
  }
};

/**
 * บันทึกข้อมูล detail โดยรวม
 */
const saveCustomerDetail = async (facebookId, type, detailData) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      { facebookId },
      {
        $set: {
          type,
          detail: detailData,
        },
      },
      { new: true, upsert: true }
    );

    logger.info(`✅ Customer detail saved: ${facebookId} (${type})`);
    return customer;
  } catch (error) {
    logger.error(`Error saving customer detail:`, error);
    throw error;
  }
};

/**
 * ลบลูกค้า (ไม่ต้องใช้ แต่มีไว้เผื่อ)
 */
const deleteCustomer = async (facebookId) => {
  try {
    await Customer.deleteOne({ facebookId });
    logger.info(`✅ Customer deleted: ${facebookId}`);
  } catch (error) {
    logger.error(`Error deleting customer:`, error);
    throw error;
  }
};

module.exports = {
  getCustomerByFacebookId,
  createCustomer,
  updateCustomer,
  saveCustomerDetail,
  deleteCustomer,
};
