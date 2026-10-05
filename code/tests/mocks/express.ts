/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type { Request, Response } from "express";

export function createMockRes(): {
  res: Partial<Response>;
  statusCalls: number[];
  contentTypeCalls: string[];
  sendCalls: unknown[];
  headerCalls: Record<string, unknown>;
} {
  const statusCalls: number[] = [];
  const contentTypeCalls: string[] = [];
  const sendCalls: unknown[] = [];
  const headerCalls: Record<string, unknown> = {};

  const mockRes: Partial<Response> = {
    status: jest.fn().mockImplementation((code: number) => {
      statusCalls.push(code);
      return mockRes;
    }),
    contentType: jest.fn().mockImplementation((type: string) => {
      contentTypeCalls.push(type);
      return mockRes;
    }),
    setHeader: jest.fn().mockImplementation((name: string, value: unknown) => {
      headerCalls[name] = value;
      return mockRes;
    }),
    send: jest.fn().mockImplementation((body: unknown) => {
      sendCalls.push(body);
      return mockRes;
    }),
    json: jest.fn().mockImplementation((body: unknown) => {
      sendCalls.push(body);
      return mockRes;
    }),
  };

  return {
    res: mockRes,
    get statusCalls() { return statusCalls; },
    get contentTypeCalls() { return contentTypeCalls; },
    get sendCalls() { return sendCalls; },
    get headerCalls() { return headerCalls; },
  };
}

export function createMockReq(params: Record<string, unknown> = {}): Partial<Request> {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    ...params,
  };
}
