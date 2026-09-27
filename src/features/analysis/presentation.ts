import { displayLabel } from '../../shared/presentation'
export const severityLabels: Record<string, string> = { CRITICAL: '심각', ERROR: '높음', WARNING: '주의', INFO: '참고' }
export const statusLabels: Record<string,string> = {PENDING:'대기 중',RUNNING:'점검 중',COMPLETED:'완료',FAILED:'실패',CANCELED:'취소됨'}
export const fileLabels: Record<string,string> = {INCLUDED:'점검함',EXCLUDED:'제외',SOURCE_UNAVAILABLE:'코드를 가져오지 못함',PARSE_ERROR:'코드 구조를 읽지 못함',LIMIT_EXCEEDED:'제한 초과'}
export const reasonLabels: Record<string,string> = {BINDING_UNRESOLVED:'이름이 가리키는 대상을 확인하지 못해 일부 점검을 건너뜀',SECRET_SCAN_ONLY:'지원하지 않는 코드 · 비밀정보 의심 내용만 확인',IGNORED_SOURCE_RULES:'점검 제외 설정 · 비밀정보 의심 내용만 확인',GENERATED_SECRET_SCAN_ONLY:'자동 생성된 파일 · 비밀정보 의심 내용만 확인',REMOVED:'삭제된 파일',NON_REGULAR_FILE:'바로가기이거나 일반 코드 파일이 아님',BINARY_OR_LFS:'텍스트 코드가 아니거나 별도 대용량 파일로 관리됨',ENCODING_UNSUPPORTED:'지원하지 않는 글자 저장 방식',FILE_SIZE_LIMIT:'파일 용량 제한 초과',SOURCE_SIZE_LIMIT:'파일 또는 전체 용량 제한',SYNTAX_ERROR:'코드 문법 오류',PARSER_TIMEOUT:'코드 구조를 읽는 시간 초과',PARSER_FAILED:'코드 구조를 읽지 못함',SOURCE_UNAVAILABLE:'해당 코드 버전의 파일을 가져오지 못함',FILE_LIMIT:'파일은 최대 100개까지 점검',INCOMPLETE_SCOPE:'건너뛰거나 점검하지 못한 부분이 있어요',NO_EVALUATED_FILES:'점검할 파일 없음',NO_SUPPORTED_FILES:'지원하는 언어의 파일이 없어 비밀정보 의심 내용만 확인'}
export const scopeLabels = { CHANGED:'이번에 바뀐 코드', CONTEXT:'변경 부분 주변에서 발견', FILE:'파일 전체에 대한 내용' }
export const confidenceLabels = { HIGH:'높음', MEDIUM:'중간', LOW:'낮음' }
export const ruleStatusLabels = { EVALUATED:'점검함', NOT_EVALUATED:'건너뜀' }
export const analysisStatus = (value: string) => displayLabel(statusLabels, value, '점검 상태 확인 필요')
