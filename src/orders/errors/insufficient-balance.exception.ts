import { HttpException, HttpStatus } from '@nestjs/common';

export class InsufficientBalanceException extends HttpException {
  constructor(required: string, available: string) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        message: 'Insufficient balance',
        required,
        available,
        error: 'Payment Required',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
