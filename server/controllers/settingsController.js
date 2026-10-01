import * as appStore from '../appStore.js';

export const getSettings = async (req, res) => {
  try {
    const settings = await appStore.loadSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const settings = await appStore.storeSettings(req.body);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getWorkflowRules = async (req, res) => {
  try {
    const items = await appStore.listWorkflowRules();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createWorkflowRule = async (req, res) => {
  try {
    const item = await appStore.insertWorkflowRule(req.body);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateWorkflowRule = async (req, res) => {
  try {
    const item = await appStore.patchWorkflowRule(req.params.id, req.body);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

