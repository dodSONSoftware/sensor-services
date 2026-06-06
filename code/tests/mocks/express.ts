import type { Request, Response } from "express";

export function createMockRes(): {
  res: Partial<Response>;
  statusCalls: number[];
  contentTypeCalls: string[];
  sendCalls: unknown[];
} {
  const statusCalls: number[] = [];
  const contentTypeCalls: string[] = [];
  const sendCalls: unknown[] = [];

  const mockRes: Partial<Response> = {
    status: jest.fn().mockImplementation((code: number) => {
      statusCalls.push(code);
      return mockRes;
    }),
    contentType: jest.fn().mockImplementation((type: string) => {
      contentTypeCalls.push(type);
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
