import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private docs: DocumentsService) {}

  @Get(':id/file')
  async file(@Param('id') id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    const { buf, mimeType } = await this.docs.readSigned(id, exp, sig);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buf);
  }
}
