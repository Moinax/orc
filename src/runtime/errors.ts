import {
  ZodError,
  ZodInvalidLiteralIssue,
  ZodInvalidTypeIssue,
  ZodIssueCode,
  ZodIssueOptionalMessage,
  ZodTypeAny,
  ZodUnrecognizedKeysIssue,
} from 'zod';

export class ClientError extends Error {
  constructor(
    public readonly message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ClientError';
  }
}

function isInvalidIssue(issue: ZodIssueOptionalMessage): issue is ZodInvalidTypeIssue {
  return issue.code === ZodIssueCode.invalid_type;
}
function isLiteralIssue(issue: ZodIssueOptionalMessage): issue is ZodInvalidLiteralIssue {
  return issue.code === ZodIssueCode.invalid_literal;
}
function isUnrecognizedKeysIssue(issue: ZodIssueOptionalMessage): issue is ZodUnrecognizedKeysIssue {
  return issue.code === ZodIssueCode.unrecognized_keys;
}

function getNestedValue(data: Record<string, any>, path: string): any {
  return path.split('.').reduce((obj, key) => obj?.[key], data);
}

export function formatError(error: ZodError, schema: ZodTypeAny, data?: Record<string, any>) {
  const schemaName = (schema._def as any)?.description ?? 'unknown';

  const issues = error.issues
    .map((issue) => {
      let formattedMessage = '\n-';
      const field = `${issue.path.join('.').replace(/\.(\d+)/g, '[$1]')}`.trim();
      formattedMessage += ` ${field !== '' ? field : 'Unknown field'}: ${issue.code}`;
      if (isInvalidIssue(issue) || isLiteralIssue(issue)) {
        formattedMessage += ` (Expected: ${issue.expected} / Received: ${issue.received})`;
      }
      if (isUnrecognizedKeysIssue(issue)) {
        formattedMessage += ` (${issue.keys.join(', ')})`;
      }
      if (data) {
        formattedMessage += ` (Value: ${JSON.stringify(getNestedValue(data, issue.path.join('.')))})`;
      }
      return formattedMessage;
    })
    .join('');

  return `Error in schema ${schemaName}:${issues}`;
}

export class ParseError extends Error {
  constructor(
    public readonly error: ZodError,
    schema: ZodTypeAny,
    data?: Record<string, any>,
  ) {
    super(formatError(error, schema, data));
    this.name = 'ParseError';
  }
}
