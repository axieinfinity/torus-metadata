import { ec as EC } from "elliptic";
import { NextFunction, Request, Response } from "express";
import { keccak256 } from "js-sha3";
import stringify from "json-stable-stringify";
import log from "loglevel";

import { getError } from "../utils";
import { getDBTableName } from "../utils/namespace";
import { validateInput } from "../validations";

const elliptic = new EC("secp256k1");

export const validationMiddleware =
  (items, isBody = true) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { errors, isValid } = validateInput(isBody ? req.body : req.query, items);
      if (!isValid) {
        return res.status(400).json({ error: errors, success: false });
      }
      return next();
    } catch (error) {
      log.error("validationMiddleware internal error", error);
      return res.status(500).json({ error: getError(error), success: false });
    }
  };

export const validationLoopMiddleware =
  (items, key, isBody = true) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsObject = isBody ? req.body : req.query;
      const mainParamToTest = paramsObject[key];
      if (!Array.isArray(mainParamToTest)) {
        return res.status(400).json({ error: { message: `${key} must be an array` }, success: false });
      }
      for (const [index, param] of mainParamToTest.entries()) {
        const { errors, isValid } = validateInput(param, items);
        if (!isValid) {
          errors.index = index;
          return res.status(400).json({ error: errors, success: false });
        }
      }
      return next();
    } catch (error) {
      log.error("validationLoopMiddleware internal error", error);
      return res.status(500).json({ error: getError(error), success: false });
    }
  };

export const validateMetadataInput = async (req: Request, res: Response, next: NextFunction) => {
  const { set_data: setData = {} } = req.body;
  const { errors, isValid } = validateInput(setData, ["data", "timestamp"]);
  if (!isValid) {
    return res.status(400).json({ error: errors, success: false });
  }
  const { timestamp } = setData;
  const timeParsed = parseInt(timestamp, 16);
  if (~~(Date.now() / 1000) - timeParsed > 60) {
    errors.timestamp = "Message has been signed more than 60s ago";
    return res.status(403).json({ error: errors, success: false });
  }
  return next();
};

export const validateMetadataLoopInput =
  (key, isBody = true) =>
  (req: Request, res: Response, next: NextFunction) => {
    const paramsObject = isBody ? req.body : req.query;
    const mainParamToTest = paramsObject[key];
    // if (!Array.isArray(mainParamToTest)) {
    //   return res.status(400).json({ error: { message: `${key} must be an array` }, success: false });
    // }
    for (const [index, param] of mainParamToTest.entries()) {
      const { set_data: setData = {} } = param;
      const { errors, isValid } = validateInput(setData, ["data", "timestamp"]);
      if (!isValid) {
        errors.index = index;
        return res.status(400).json({ error: errors, success: false });
      }
      const { timestamp } = setData;
      const timeParsed = parseInt(timestamp, 16);
      if (~~(Date.now() / 1000) - timeParsed > 60) {
        errors.timestamp = "Message has been signed more than 60s ago";
        return res.status(403).json({ error: errors, success: false });
      }
    }
    return next();
  };

export const validateSignature = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pub_key_X: pubKeyX, pub_key_Y: pubKeyY, signature, set_data: setData } = req.body;
    const pubKey = elliptic.keyFromPublic({ x: pubKeyX, y: pubKeyY }, "hex");
    const decodedSignature = Buffer.from(signature, "base64").toString("hex");
    const ecSignature = {
      r: Buffer.from(decodedSignature.substring(0, 64), "hex"),
      s: Buffer.from(decodedSignature.substring(64, 128), "hex"),
    };
    const isValidSignature = elliptic.verify(keccak256(stringify(setData)), ecSignature, pubKey);
    if (!isValidSignature) {
      const errors = {};
      errors.signature = "Invalid signature";
      return res.status(403).json({ error: errors, success: false });
    }
    return next();
  } catch (error) {
    log.error("signature verification failed", error);
    return res.status(500).json({ error: getError(error), success: false });
  }
};

export const validateLoopSignature =
  (key, isBody = true) =>
  (req: Request, res: Response, next: NextFunction) => {
    const paramsObject = isBody ? req.body : req.query;
    const mainParamToTest = paramsObject[key];
    // if (!Array.isArray(mainParamToTest)) {
    //   return res.status(400).json({ error: { message: `${key} must be an array` }, success: false });
    // }
    for (const [index, param] of mainParamToTest.entries()) {
      try {
        const { pub_key_X: pubKeyX, pub_key_Y: pubKeyY, signature, set_data: setData } = param;
        const pubKey = elliptic.keyFromPublic({ x: pubKeyX, y: pubKeyY }, "hex");
        const decodedSignature = Buffer.from(signature, "base64").toString("hex");
        const ecSignature = {
          r: Buffer.from(decodedSignature.substring(0, 64), "hex"),
          s: Buffer.from(decodedSignature.substring(64, 128), "hex"),
        };
        const isValidSignature = elliptic.verify(keccak256(stringify(setData)), ecSignature, pubKey);
        if (!isValidSignature) {
          const errors = { index, signature: "Invalid signature" };
          return res.status(403).json({ error: errors, success: false });
        }
      } catch (error) {
        error.index = index;
        log.error("signature verification failed", error);
        return res.status(500).json({ error: getError(error), success: false });
      }
    }
    return next();
  };

export const validateNamespace = (req: Request, res: Response, next: NextFunction) => {
  try {
    const { namespace } = req.body;
    req.body.tableName = getDBTableName(namespace); // function will validate namespace too
    return next();
  } catch (error) {
    log.error(error);
    return res.status(500).json({ error: getError(error), success: false });
  }
};

export const validateNamespaceLoop =
  (key, isBody = true) =>
  (req: Request, res: Response, next: NextFunction) => {
    const paramsObject = isBody ? req.body : req.query;
    const mainParamToTest = paramsObject[key];
    for (const [index, param] of mainParamToTest.entries()) {
      try {
        const { namespace } = param;
        param.tableName = getDBTableName(namespace);
      } catch (error) {
        log.error(index, error);
        return res.status(500).json({ error: getError(error), success: false });
      }
    }
    return next();
  };

export const validateLockData = (req: Request, res: Response, next: NextFunction) => {
  try {
    const { key: pubKey, signature, data } = req.body;
    // verify signature here
    const isValidSignature = elliptic.verify(keccak256(stringify(data)), signature, Buffer.from(pubKey, "hex"));
    if (!isValidSignature) return res.status(403).json({ error: "Invalid Signature", status: 0 });
    // protection against old signature
    const { timeStamp } = data;
    if (~~(Date.now() / 1000) - timeStamp > 60) {
      return res.status(403).json({ error: "Message has been signed more than 60s ago", status: 0 });
    }
    return next();
  } catch (error) {
    log.error(error);
    return res.status(500).json({ error: getError(error), status: 0 });
  }
};

// V2 Validation Functions
function validV2InputWithSig(body) {
  if ("set_data" in body && "pub_key_X" in body && "pub_key_Y" in body && "signature" in body) {
    return true;
  }
  return false;
}

export const validateGetOrSetNonceSetInput = async (req: Request, res: Response, next: NextFunction) => {
  if (!validV2InputWithSig(req.body)) {
    res.locals.noValidSig = true;
    return next();
  }
  const { set_data: setData = {} } = req.body;
  const { errors, isValid } = validateInput(setData, ["data", "timestamp"]);
  if (!isValid) {
    return res.status(400).json({ error: errors, success: false });
  }
  const { timestamp, data } = setData;
  if (!["getOrSetNonce", "getNonce"].includes(data)) {
    errors.data = "Should be equal to 'getOrSetNonce' or 'getNonce'";
    return res.status(403).json({ error: errors, success: false });
  }
  const timeParsed = parseInt(timestamp, 16);
  if (~~(Date.now() / 1000) - timeParsed > 60) {
    errors.timestamp = "Message has been signed more than 60s ago";
    return res.status(403).json({ error: errors, success: false });
  }
  return next();
};

export const validateGetOrSetNonceSignature = async (req: Request, res: Response, next: NextFunction) => {
  if (!validV2InputWithSig(req.body)) {
    res.locals.noValidSig = true;
    return next();
  }
  try {
    const { pub_key_X: pubKeyX, pub_key_Y: pubKeyY, signature, set_data: setData } = req.body;
    const pubKey = elliptic.keyFromPublic({ x: pubKeyX, y: pubKeyY }, "hex");
    const decodedSignature = Buffer.from(signature, "base64").toString("hex");
    const ecSignature = {
      r: Buffer.from(decodedSignature.substring(0, 64), "hex"),
      s: Buffer.from(decodedSignature.substring(64, 128), "hex"),
    };
    const isValidSignature = elliptic.verify(keccak256(stringify(setData)), ecSignature, pubKey);
    if (!isValidSignature) {
      const errors = {};
      errors.signature = "Invalid signature";
      return res.status(403).json({ error: errors, success: false });
    }
    return next();
  } catch (error) {
    log.error("signature verification failed", error);
    return res.status(500).json({ error: getError(error), success: false });
  }
};
