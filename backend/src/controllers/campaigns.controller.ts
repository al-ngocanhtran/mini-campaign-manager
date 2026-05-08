import { Response } from "express";
import { AuthRequest } from "../middleware/auth.js";
import * as campaignService from "../services/campaigns.service.js";

export async function list(req: AuthRequest, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
  res.json(await campaignService.listCampaigns(req.user!.id, page, limit));
}

export async function create(req: AuthRequest, res: Response) {
  res.status(201).json(await campaignService.createCampaign(req.user!.id, req.body));
}

export async function get(req: AuthRequest, res: Response) {
  res.json(await campaignService.getCampaign(req.user!.id, Number(req.params.id)));
}

export async function update(req: AuthRequest, res: Response) {
  res.json(await campaignService.updateCampaign(req.user!.id, Number(req.params.id), req.body));
}

export async function remove(req: AuthRequest, res: Response) {
  await campaignService.deleteCampaign(req.user!.id, Number(req.params.id));
  res.status(204).end();
}

export async function schedule(req: AuthRequest, res: Response) {
  const result = await campaignService.scheduleCampaign(
    req.user!.id,
    Number(req.params.id),
    new Date(req.body.scheduled_at),
  );
  res.json(result);
}

export async function send(req: AuthRequest, res: Response) {
  res.json(await campaignService.sendCampaign(req.user!.id, Number(req.params.id)));
}

export async function stats(req: AuthRequest, res: Response) {
  res.json(await campaignService.getCampaignStats(req.user!.id, Number(req.params.id)));
}
