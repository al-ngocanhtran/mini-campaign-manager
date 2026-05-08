import { Request, Response } from "express";
import * as authService from "../services/auth.service.js";

export async function register(req: Request, res: Response) {
  res.status(201).json(await authService.register(req.body));
}

export async function login(req: Request, res: Response) {
  res.json(await authService.login(req.body));
}
