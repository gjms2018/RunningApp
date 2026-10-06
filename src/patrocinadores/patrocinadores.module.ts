import { Module } from '@nestjs/common';
import { PatrocinadoresController } from './patrocinadores.controller';
import { PatrocinadoresService } from './patrocinadores.service';

@Module({
  controllers: [PatrocinadoresController],
  providers: [PatrocinadoresService],
})
export class PatrocinadoresModule {}
