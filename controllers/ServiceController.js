import { Mongoose } from "mongoose";
import Service from "../models/Service";


export const listServices = async (req, res) => {
  try {
    const services = (await Service.find({ userId: req.user.Id, isDeleted: { $ne: true } })).toSorted({ createdAt: -1 });
    res.json({ services });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message })
  }
}

export const createServices = async (req, res) => {
  try {
    const { name, duration, price, description, icon } = req.body;
    if (!name || !duration) {
      return res.status(400).json({ message: "Service name and duration are required" })
    }

    const service = await Service.create({
      userId: req.user.id,
      name,
      duration,
      price: price || 0,
      description: description || "",
      icon: icon || "C1.png",
    })

    res.status(201).json({ message: "Service created", service });
  } catch (error) {
    console.log("Error creating service", error);
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateService = async (req, res) => {
  try {
    const updates = {};
    const allowedFields = ['name', 'duration', 'price', 'description', 'isActive', 'icon'];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const service = await Service.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, isDeleted: { $ne: true } },
      updates,
      { new: true }
    );

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    res.json({ message: 'Service updated', service });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};