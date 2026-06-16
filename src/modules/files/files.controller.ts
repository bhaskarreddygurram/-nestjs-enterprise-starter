import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { SkipResponseTransform } from '../../common/decorators/skip-response-transform.decorator';
import { PaginatedDto } from '../../common/dto/page-meta.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { FileResponseDto } from './dto/file-response.dto';
import { FilesService } from './files.service';

// Absolute backstop so a single request can't buffer an unbounded payload in
// memory. The real, configurable policy (UPLOAD_MAX_SIZE_MB) is enforced in
// the service and returns a clean 400.
const ABSOLUTE_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  @Permissions('file:create')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: ABSOLUTE_MAX_UPLOAD_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload a file' })
  @ApiCreatedResponse({ type: FileResponseDto })
  @ApiForbiddenResponse({ description: 'Missing file:create permission' })
  upload(
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true }))
    file: Express.Multer.File,
    @CurrentUser('id') uploaderId: string,
  ): Promise<FileResponseDto> {
    return this.filesService.upload(file, uploaderId);
  }

  @Get()
  @Permissions('file:read')
  @ApiOperation({ summary: 'List files (paginated)' })
  @ApiOkResponse({ description: 'Paginated list of files' })
  findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedDto<FileResponseDto>> {
    return this.filesService.findAll(query);
  }

  @Get(':id')
  @Permissions('file:read')
  @ApiOperation({ summary: 'Get file metadata by id' })
  @ApiOkResponse({ type: FileResponseDto })
  @ApiNotFoundResponse({ description: 'File not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<FileResponseDto> {
    return this.filesService.findOne(id);
  }

  @Get(':id/download')
  @Permissions('file:read')
  @SkipResponseTransform()
  @ApiOperation({ summary: 'Download the file contents' })
  @ApiOkResponse({ description: 'Binary file stream' })
  @ApiNotFoundResponse({ description: 'File not found' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { file, data } = await this.filesService.download(id);
    return new StreamableFile(data, {
      type: file.mimeType,
      disposition: `attachment; filename="${file.originalName}"`,
    });
  }

  @Delete(':id')
  @Permissions('file:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a file (soft-delete + remove object)' })
  @ApiNoContentResponse({ description: 'File deleted' })
  @ApiNotFoundResponse({ description: 'File not found' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.filesService.remove(id);
  }
}
