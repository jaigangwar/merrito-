// ===== SAVED FILTER CONTROLLER - Save and manage search filters =====
import { generateId, getDB, saveDB } from '../db.js';

// Get all saved filters for user
export async function getSavedFilters(req, res) {
  try {
    const dbData = getDB();
    if (!dbData.saved_filters) dbData.saved_filters = [];

    // Filter by user
    const filters = dbData.saved_filters.filter(f => f.user_id === req.user.id);

    res.json({ data: filters, total: filters.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get single saved filter
export async function getSavedFilter(req, res) {
  try {
    const dbData = getDB();
    const filter = dbData.saved_filters?.find(f => f.id === req.params.id);

    if (!filter) {
      return res.status(404).json({ error: 'Saved filter not found' });
    }

    // Check ownership
    if (filter.user_id !== req.user.id && !filter.is_shared) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(filter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create saved filter
export async function createSavedFilter(req, res) {
  try {
    const {
      name,
      description,
      filters,
      is_shared = false,
      is_default = false
    } = req.body;

    if (!name || !filters) {
      return res.status(400).json({ error: 'name and filters are required' });
    }

    const dbData = getDB();
    if (!dbData.saved_filters) dbData.saved_filters = [];

    // If setting as default, unset other defaults for this user
    if (is_default) {
      dbData.saved_filters.forEach(f => {
        if (f.user_id === req.user.id) {
          f.is_default = false;
        }
      });
    }

    const savedFilter = {
      id: generateId(),
      user_id: req.user.id,
      name,
      description: description || '',
      filters, // { stage: 'enquiry', source: 'Website', ... }
      is_shared,
      is_default,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    dbData.saved_filters.push(savedFilter);
    saveDB(dbData);

    res.status(201).json(savedFilter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Update saved filter
export async function updateSavedFilter(req, res) {
  try {
    const dbData = getDB();
    if (!dbData.saved_filters) dbData.saved_filters = [];

    const index = dbData.saved_filters.findIndex(f => f.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Saved filter not found' });
    }

    // Check ownership
    if (dbData.saved_filters[index].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // If setting as default, unset other defaults
    if (req.body.is_default) {
      dbData.saved_filters.forEach(f => {
        if (f.user_id === req.user.id && f.id !== req.params.id) {
          f.is_default = false;
        }
      });
    }

    const updated = {
      ...dbData.saved_filters[index],
      ...req.body,
      updated_at: new Date().toISOString()
    };

    dbData.saved_filters[index] = updated;
    saveDB(dbData);

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete saved filter
export async function deleteSavedFilter(req, res) {
  try {
    const dbData = getDB();
    if (!dbData.saved_filters) dbData.saved_filters = [];

    const index = dbData.saved_filters.findIndex(f => f.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Saved filter not found' });
    }

    // Check ownership
    if (dbData.saved_filters[index].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    dbData.saved_filters.splice(index, 1);
    saveDB(dbData);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get shared filters
export async function getSharedFilters(req, res) {
  try {
    const dbData = getDB();
    if (!dbData.saved_filters) dbData.saved_filters = [];

    // Get all shared filters
    const filters = dbData.saved_filters.filter(f => f.is_shared);

    res.json({ data: filters, total: filters.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
