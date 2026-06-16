import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Permissions('audit:read')
  @ApiOperation({ summary: 'List audit log entries (paginated, filterable)' })
  @ApiOkResponse({ description: 'Paginated audit log' })
  @ApiForbiddenResponse({ description: 'Missing audit:read permission' })
  findAll(@Query() query: AuditQueryDto) {
    return this.auditService.findAll(query);
  }
}
