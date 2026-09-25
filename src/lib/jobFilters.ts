export const jobLocations = [
  { id: 'all', name: '전국' }, { id: 'seoul', name: '서울' }, { id: 'gyeonggi', name: '경기' },
  { id: 'incheon', name: '인천' }, { id: 'busan', name: '부산' }, { id: 'daegu', name: '대구' },
  { id: 'gwangju', name: '광주' }, { id: 'daejeon', name: '대전' }, { id: 'ulsan', name: '울산' },
  { id: 'sejong', name: '세종' }, { id: 'gangwon', name: '강원' }, { id: 'chungbuk', name: '충북' },
  { id: 'chungnam', name: '충남' }, { id: 'jeonbuk', name: '전북' }, { id: 'jeonnam', name: '전남' },
  { id: 'gyeongbuk', name: '경북' }, { id: 'gyeongnam', name: '경남' }, { id: 'jeju', name: '제주' },
] as const;

export const jobCategories = [
  { id: 'all', name: '전체 분야' }, { id: 'development', name: '개발·IT' }, { id: 'data', name: '데이터·AI' },
  { id: 'design', name: '디자인' }, { id: 'planning', name: '기획·경영' }, { id: 'marketing', name: '마케팅·광고' },
  { id: 'sales', name: '영업·고객관리' }, { id: 'hr', name: '인사·총무' }, { id: 'finance', name: '재무·회계·금융' },
  { id: 'manufacturing', name: '생산·제조' }, { id: 'logistics', name: '물류·무역' }, { id: 'service', name: '서비스' },
  { id: 'education', name: '교육' }, { id: 'medical', name: '의료·보건' }, { id: 'construction', name: '건설·시설' },
  { id: 'research', name: '연구·개발' }, { id: 'legal', name: '법률·법무' },
] as const;

export const jobExperiences = [
  { id: 'all', name: '경력 무관' }, { id: 'new', name: '신입' }, { id: '1', name: '경력 1년' },
  { id: '3', name: '경력 3년' }, { id: '5', name: '경력 5년' }, { id: '10', name: '경력 10년' },
] as const;
