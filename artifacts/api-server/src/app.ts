import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { pushLogEntry } from "./lib/adminAuth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
    customSuccessMessage(req, res) {
      pushLogEntry({
        ts: new Date().toISOString(),
        level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
        method: req.method,
        url: req.url?.split("?")[0],
        status: res.statusCode,
        responseTime: (res as any).responseTime as number | undefined,
      });
      return "request completed";
    },
    customErrorMessage(req, res, err) {
      pushLogEntry({
        ts: new Date().toISOString(),
        level: "error",
        method: req.method,
        url: req.url?.split("?")[0],
        status: res.statusCode,
        msg: err?.message,
      });
      return "request error";
    },
  }),
);
app.use(cors());

// Stripe webhook requires raw body buffer — must be registered before express.json()
app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
