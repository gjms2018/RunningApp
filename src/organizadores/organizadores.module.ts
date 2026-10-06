import { Module } from '@nestjs/common';
import { OrganizadoresController } from './organizadores.controller';
import { OrganizadoresService } from './organizadores.service';

@Module({
  controllers: [OrganizadoresController],
  providers: [OrganizadoresService],
})
export class OrganizadoresModule {}
