<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CompanySettingResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return array_merge(
            ['id' => $this->id, 'company_id' => $this->company_id],
            collect($this->resource->getAttributes())
                ->except(['id', 'company_id', 'created_at', 'updated_at'])
                ->toArray()
        );
    }
}
