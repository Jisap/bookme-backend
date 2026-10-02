import Service from "../models/Service.js";


export const listServices = async (req, res) => {
  try {
    const services = await Service.find({ userId: req.user.id, isDeleted: { $ne: true } }).sort({ createdAt: -1 });
    res.json({ services });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message })
  }
}

export const createServices = async (req, res) => {
  try {
    const { name, duration, price, description, icon, isActive } = req.body;
    if (!name || !duration) {
      return res.status(400).json({ message: "Service name and duration are required" })
    }

    const parsedPrice = Number(price);
    const service = await Service.create({
      userId: req.user.id,
      name,
      duration,
      price: Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : 0,
      description: description || "",
      icon: icon || "C1.png",
      // Acepta isActive solo si viene como booleano explícito.
      // Si no viene, se usa el default del modelo (false = Hidden).
      ...(typeof isActive === "boolean" ? { isActive } : {}),
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

export const deleteService = async (req, res) => {
  try {
    const service = await Service.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, isDeleted: { $ne: true } },
      { isDeleted: true, isActive: false },
      { new: true }
    );

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    res.json({ message: 'Service deleted', service });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};